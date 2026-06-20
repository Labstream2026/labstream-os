"use server";

import crypto from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { buildProposal } from "@/lib/proposals/templates";
import { newBlock, BRAND_DEFAULT, type Block, type Brand, type Answers, type BlockType } from "@/lib/proposals/types";
import { catalogToBudgetSections, type BudgetSection } from "@/lib/proposals/budget";
import { getCatalogForWizard } from "@/lib/services-catalog";
import { createWithSequentialCode, maxCodeFrom } from "@/lib/sequential-code";
import { saveBuffer, writeRelBuffer } from "@/lib/storage";
import { optimizeToWebp, isOptimizableImage } from "@/lib/image";

async function requirePerm(key: string) {
  const session = await getSession();
  if (!hasPermission(session, key)) throw new Error("No autorizado");
  return session!;
}

// Si la propuesta está vinculada a un cliente, el usuario debe poder acceder a ese cliente.
// Las propuestas SIN cliente vinculado solo las puede ver/editar su autor o un admin
// (de lo contrario serían un IDOR: accesibles por cualquiera con crear_cotizaciones).
async function ensureProposalAccess(id: string): Promise<void> {
  const session = await getSession();
  const p = await db.proposal.findUnique({ where: { id }, select: { clientId: true, createdById: true } });
  if (!p) throw new Error("Propuesta inexistente");
  if (p.clientId) {
    if (!(await userCanAccessClient(p.clientId, session))) throw new Error("No autorizado");
    return;
  }
  // Sin cliente: solo el autor o un admin.
  if (p.createdById !== session?.id && session?.role !== "admin") throw new Error("No autorizado");
}

function refresh(id?: string) {
  revalidatePath("/cotizaciones");
  if (id) revalidatePath(`/cotizaciones/propuestas/${id}`);
}

// Código PROP-#### a prueba de colisiones (deriva del máximo + reintento ante P2002).
const nextProposalMax = () => maxCodeFrom((args) => db.proposal.findMany(args));

// Allowlist estricta para el HTML de los bloques de texto. Se sanea AL GUARDAR (no solo
// al renderizar) porque el resultado se sirve en el portal PÚBLICO del cliente con
// dangerouslySetInnerHTML → defensa real contra XSS almacenado.
const HTML_OPTS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "blockquote", "span"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }) },
};

// Sanea la lista de bloques del editor: valida tamaño/forma y limpia el HTML de los
// campos de texto (`body`) con una allowlist real.
function sanitizeBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) throw new Error("Bloques inválidos");
  if (raw.length > 100) throw new Error("Demasiados bloques");
  const json = JSON.stringify(raw);
  if (json.length > 500_000) throw new Error("Propuesta demasiado grande");
  const blocks = raw as Block[];
  for (const b of blocks) {
    const rec = b as unknown as Record<string, unknown>;
    if (typeof rec.body === "string") rec.body = sanitizeHtml(rec.body, HTML_OPTS);
  }
  return blocks;
}

export async function createProposal(
  templateKey: string,
  answers: Answers,
  budgetSections?: BudgetSection[],
  pricing?: { price: number; discountPct: number; contingencyPct: number },
) {
  await requirePerm("crear_cotizaciones");
  const session = (await getSession())!;
  const { brand, blocks } = buildProposal(templateKey, answers);

  // Secciones de inversión del bloque budget. Orden de preferencia:
  //  1) Las que armó el equipo en el wizard (ya salen del catálogo vivo de la BD).
  //  2) El catálogo VIVO de la BD para esta plantilla (precios que el equipo mantiene en
  //     "Servicios y valores") — así las plantillas no usan precios hardcodeados viejos.
  //  3) El bloque por defecto del template (COSTOS de budget.ts), solo como respaldo si la BD está vacía.
  const bi = blocks.findIndex((b) => b.type === "budget");
  if (bi >= 0) {
    let sections: BudgetSection[] | undefined = budgetSections && budgetSections.length ? budgetSections : undefined;
    if (!sections) {
      const dbCat = (await getCatalogForWizard())[templateKey];
      if (dbCat && dbCat.length) sections = catalogToBudgetSections(dbCat);
    }
    blocks[bi] = {
      ...blocks[bi],
      ...(sections ? { sections } : {}),
      ...(pricing
        ? { price: Math.max(0, Math.round(pricing.price) || 0), discountPct: Math.max(0, Math.min(100, pricing.discountPct || 0)), contingencyPct: Math.max(0, Math.min(100, pricing.contingencyPct || 0)) }
        : {}),
    };
  }

  const cliente = (answers.cliente || "").trim();
  const tpl = templateKey;
  const title = cliente ? `Propuesta · ${cliente}` : "Propuesta sin título";

  // Si el nombre del cliente coincide con un cliente de OS, se vincula solo.
  const matched = cliente
    ? await db.client.findFirst({ where: { name: { equals: cliente, mode: "insensitive" } }, select: { id: true } })
    : null;

  const proposal = await createWithSequentialCode({
    prefix: "PROP",
    findMaxCode: nextProposalMax,
    create: (code) =>
      db.proposal.create({
        data: {
          code,
          templateKey: tpl,
          title,
          brand: brand as unknown as object,
          blocks: blocks as unknown as object,
          answers: answers as unknown as object,
          clientId: matched?.id ?? null,
          createdById: session.id,
        },
      }),
  });
  refresh(proposal.id);
  redirect(`/cotizaciones/propuestas/${proposal.id}`);
}

export async function saveProposalBlocks(id: string, blocks: unknown) {
  await requirePerm("crear_cotizaciones");
  await ensureProposalAccess(id);
  const clean = sanitizeBlocks(blocks);
  await db.proposal.update({ where: { id }, data: { blocks: clean as unknown as object } });
  refresh(id);
}

// Sube una imagen de la propuesta (portada, carrusel…) al NAS y devuelve una URL
// PÚBLICA (las imágenes de una propuesta se ven en el portal del cliente sin sesión).
const MAX_PROPOSAL_IMG = 8 * 1024 * 1024;
export async function uploadProposalImage(proposalId: string, formData: FormData): Promise<{ url: string } | null> {
  await requirePerm("crear_cotizaciones");
  await ensureProposalAccess(proposalId);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_PROPOSAL_IMG) throw new Error("La imagen supera 8 MB");
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)$/i.test(file.name)) {
    throw new Error("El archivo no es una imagen");
  }
  // El proposalId solo puede ser un cuid (letras/números) para evitar rutas raras.
  if (!/^[a-z0-9]+$/i.test(proposalId)) throw new Error("Propuesta inválida");
  const buf = Buffer.from(await file.arrayBuffer());
  const relDir = `proposal/${proposalId}`;
  let filename: string;
  // Optimiza a WebP (lado largo ≤ 1600px); si falla (p. ej. HEIC sin soporte), guarda el original.
  const webp = isOptimizableImage(file.name, file.type) ? await optimizeToWebp(buf, { maxEdge: 1600 }) : null;
  if (webp) {
    filename = `${crypto.randomUUID()}.webp`;
    await writeRelBuffer(`${relDir}/${filename}`, webp);
  } else {
    const rel = await saveBuffer(relDir, `${crypto.randomUUID()}-${file.name}`, buf);
    filename = rel.split("/").pop()!;
  }
  return { url: `/api/proposal-img/${proposalId}/${filename}` };
}

export async function updateProposalMeta(
  id: string,
  data: { title?: string; brand?: Brand; expiresAt?: string | null; clientId?: string | null },
) {
  const session = await requirePerm("crear_cotizaciones");
  await ensureProposalAccess(id);
  const patch: Record<string, unknown> = {};
  if (typeof data.title === "string" && data.title.trim()) patch.title = data.title.trim().slice(0, 160);
  if (data.brand) patch.brand = { ...BRAND_DEFAULT, ...data.brand } as unknown as object;
  if (data.expiresAt !== undefined) patch.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  if (data.clientId !== undefined) {
    // Reasignar a un cliente exige poder acceder a ESE cliente (si no, sería reasignar
    // la propuesta a un cliente ajeno conociendo el id). Desvincular (null) sí se permite.
    if (data.clientId && !(await userCanAccessClient(data.clientId, session))) throw new Error("No autorizado");
    patch.clientId = data.clientId || null;
  }
  await db.proposal.update({ where: { id }, data: patch });
  refresh(id);
  if (data.clientId) revalidatePath(`/clientes/${data.clientId}`);
}

const STATUSES = ["BORRADOR", "ENVIADA", "ACEPTADA", "VENCIDA"];
export async function setProposalStatus(id: string, status: string) {
  if (!STATUSES.includes(status)) throw new Error("Estado inválido");
  // Marcar ACEPTADA (transición comercialmente sensible) exige aprobar_cotizaciones,
  // igual que en cotizaciones; el resto basta con crear_cotizaciones.
  await requirePerm(status === "ACEPTADA" ? "aprobar_cotizaciones" : "crear_cotizaciones");
  await ensureProposalAccess(id);
  // Inmutabilidad: una propuesta ACEPTADA no puede salir de ese estado salvo que el actor
  // tenga aprobar_cotizaciones (si no, un usuario sin permiso de aprobación podría revertir
  // silenciosamente una propuesta ya aceptada).
  const current = await db.proposal.findUnique({ where: { id }, select: { status: true } });
  if (current?.status === "ACEPTADA" && status !== "ACEPTADA") {
    await requirePerm("aprobar_cotizaciones");
  }
  await db.proposal.update({ where: { id }, data: { status: status as never } });
  refresh(id);
}

export async function addProposalBlock(id: string, type: string) {
  await requirePerm("crear_cotizaciones");
  await ensureProposalAccess(id);
  const p = await db.proposal.findUnique({ where: { id }, select: { blocks: true, brand: true } });
  if (!p) throw new Error("Propuesta inexistente");
  const brand = p.brand as unknown as Brand;
  const blocks = sanitizeBlocks(p.blocks);
  blocks.push(newBlock(type as BlockType, brand?.email));
  await db.proposal.update({ where: { id }, data: { blocks: blocks as unknown as object } });
  refresh(id);
}

export async function deleteProposal(id: string) {
  await requirePerm("crear_cotizaciones");
  await ensureProposalAccess(id);
  await db.proposal.delete({ where: { id } });
  revalidatePath("/cotizaciones");
  redirect("/cotizaciones");
}

export async function duplicateProposal(id: string) {
  await requirePerm("crear_cotizaciones");
  await ensureProposalAccess(id);
  const session = (await getSession())!;
  const src = await db.proposal.findUnique({ where: { id } });
  if (!src) throw new Error("Propuesta inexistente");
  const copy = await createWithSequentialCode({
    prefix: "PROP",
    findMaxCode: nextProposalMax,
    create: (code) =>
      db.proposal.create({
        data: {
          code,
          templateKey: src.templateKey,
          title: `${src.title} (copia)`,
          brand: src.brand as object,
          blocks: src.blocks as object,
          answers: src.answers as object,
          clientId: src.clientId,
          createdById: session.id,
        },
      }),
  });
  refresh(copy.id);
  redirect(`/cotizaciones/propuestas/${copy.id}`);
}
