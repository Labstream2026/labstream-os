"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { buildProposal } from "@/lib/proposals/templates";
import { newBlock, BRAND_DEFAULT, type Block, type Brand, type Answers, type BlockType } from "@/lib/proposals/types";
import type { BudgetSection } from "@/lib/proposals/budget";

async function requirePerm(key: string) {
  const session = await getSession();
  if (!hasPermission(session, key)) throw new Error("No autorizado");
  return session!;
}

function refresh(id?: string) {
  revalidatePath("/cotizaciones");
  if (id) revalidatePath(`/cotizaciones/propuestas/${id}`);
}

async function nextCode(): Promise<string> {
  const count = await db.proposal.count();
  return `PROP-${String(count + 1).padStart(4, "0")}`;
}

// Sanea la lista de bloques que llega del editor (defensa básica de tamaño/forma).
function sanitizeBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) throw new Error("Bloques inválidos");
  if (raw.length > 100) throw new Error("Demasiados bloques");
  const json = JSON.stringify(raw);
  if (json.length > 500_000) throw new Error("Propuesta demasiado grande");
  return raw as Block[];
}

export async function createProposal(
  templateKey: string,
  answers: Answers,
  budgetSections?: BudgetSection[],
) {
  await requirePerm("crear_cotizaciones");
  const session = (await getSession())!;
  const { brand, blocks } = buildProposal(templateKey, answers);

  // Si el asistente personalizó el desglose, reemplaza las secciones del bloque budget.
  if (budgetSections && Array.isArray(budgetSections)) {
    const bi = blocks.findIndex((b) => b.type === "budget");
    if (bi >= 0) blocks[bi] = { ...blocks[bi], sections: budgetSections };
  }

  const cliente = (answers.cliente || "").trim();
  const tpl = templateKey;
  const title = cliente ? `Propuesta · ${cliente}` : "Propuesta sin título";

  const proposal = await db.proposal.create({
    data: {
      code: await nextCode(),
      templateKey: tpl,
      title,
      brand: brand as unknown as object,
      blocks: blocks as unknown as object,
      answers: answers as unknown as object,
      createdById: session.id,
    },
  });
  refresh(proposal.id);
  redirect(`/cotizaciones/propuestas/${proposal.id}`);
}

export async function saveProposalBlocks(id: string, blocks: unknown) {
  await requirePerm("crear_cotizaciones");
  const clean = sanitizeBlocks(blocks);
  await db.proposal.update({ where: { id }, data: { blocks: clean as unknown as object } });
  refresh(id);
}

export async function updateProposalMeta(
  id: string,
  data: { title?: string; brand?: Brand; expiresAt?: string | null },
) {
  await requirePerm("crear_cotizaciones");
  const patch: Record<string, unknown> = {};
  if (typeof data.title === "string" && data.title.trim()) patch.title = data.title.trim().slice(0, 160);
  if (data.brand) patch.brand = { ...BRAND_DEFAULT, ...data.brand } as unknown as object;
  if (data.expiresAt !== undefined) patch.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  await db.proposal.update({ where: { id }, data: patch });
  refresh(id);
}

const STATUSES = ["BORRADOR", "ENVIADA", "ACEPTADA", "VENCIDA"];
export async function setProposalStatus(id: string, status: string) {
  await requirePerm("crear_cotizaciones");
  if (!STATUSES.includes(status)) throw new Error("Estado inválido");
  await db.proposal.update({ where: { id }, data: { status: status as never } });
  refresh(id);
}

export async function addProposalBlock(id: string, type: string) {
  await requirePerm("crear_cotizaciones");
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
  await db.proposal.delete({ where: { id } });
  revalidatePath("/cotizaciones");
  redirect("/cotizaciones");
}

export async function duplicateProposal(id: string) {
  await requirePerm("crear_cotizaciones");
  const session = (await getSession())!;
  const src = await db.proposal.findUnique({ where: { id } });
  if (!src) throw new Error("Propuesta inexistente");
  const copy = await db.proposal.create({
    data: {
      code: await nextCode(),
      templateKey: src.templateKey,
      title: `${src.title} (copia)`,
      brand: src.brand as object,
      blocks: src.blocks as object,
      answers: src.answers as object,
      clientId: src.clientId,
      createdById: session.id,
    },
  });
  refresh(copy.id);
  redirect(`/cotizaciones/propuestas/${copy.id}`);
}
