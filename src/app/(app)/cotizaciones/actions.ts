"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { getQuoteSettings } from "@/lib/services-catalog";

async function requirePerm(key: string) {
  const session = await getSession();
  if (!hasPermission(session, key)) throw new Error("No autorizado");
  return session!;
}

// Además del permiso global, el usuario debe poder acceder al CLIENTE de la cotización
// (es miembro o participa en sus proyectos). Evita que cualquier `ventas` edite/borre
// cotizaciones de clientes ajenos conociendo el id.
async function ensureQuoteAccess(quoteId: string): Promise<void> {
  const session = await getSession();
  const q = await db.quote.findUnique({ where: { id: quoteId }, select: { clientId: true } });
  if (!q || !(await userCanAccessClient(q.clientId, session))) throw new Error("No autorizado");
}

function refresh(id?: string) {
  revalidatePath("/cotizaciones");
  if (id) revalidatePath(`/cotizaciones/${id}`);
}

async function nextCode(): Promise<string> {
  const count = await db.quote.count();
  return `COT-${String(count + 1).padStart(4, "0")}`;
}

const QUOTE_STATUSES = ["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA"];

// Una cotización APROBADA no se edita (el total firmado debe quedar fijo).
async function assertEditable(quoteId: string) {
  const q = await db.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
  if (!q) throw new Error("Cotización inexistente");
  if (q.status === "APROBADA") throw new Error("La cotización está aprobada y no se puede editar.");
}

export async function createQuote(formData: FormData) {
  const session = await requirePerm("crear_cotizaciones");
  const title = String(formData.get("title") ?? "").trim() || "Cotización sin título";
  const clientId = String(formData.get("clientId") ?? "");
  const projectId = String(formData.get("projectId") ?? "") || null;
  const recipientName = String(formData.get("recipientName") ?? "").trim() || null;
  if (!clientId) throw new Error("Falta el cliente");
  if (!(await userCanAccessClient(clientId, session))) throw new Error("No autorizado");

  // El imprevisto por defecto sale de los ajustes globales (oculto al cliente). El IVA
  // también, para que una cotización nueva ya traiga los porcentajes de la empresa.
  const settings = await getQuoteSettings();

  const quote = await db.quote.create({
    data: {
      code: await nextCode(),
      title,
      clientId,
      projectId,
      recipientName,
      taxRate: settings.iva,
      contingencyPct: settings.contingencyPct,
      createdById: session.id,
      items: { create: [{ description: "", quantity: 1, unitPrice: 0, position: 0 }] },
    },
  });
  refresh(quote.id);
  redirect(`/cotizaciones/${quote.id}`);
}

export async function updateQuoteMeta(quoteId: string, formData: FormData) {
  await requirePerm("crear_cotizaciones");
  await ensureQuoteAccess(quoteId);
  await assertEditable(quoteId);
  const title = String(formData.get("title") ?? "").trim();
  const taxRate = Math.max(0, Math.min(100, parseInt(String(formData.get("taxRate") ?? "0"), 10) || 0));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const recipientName = String(formData.get("recipientName") ?? "").trim() || null;
  const recipientCity = String(formData.get("recipientCity") ?? "").trim() || null;
  const intro = String(formData.get("intro") ?? "").trim() || null;
  const scope = String(formData.get("scope") ?? "").trim() || null;
  const deliverables = String(formData.get("deliverables") ?? "").trim() || null;
  const contingencyPct = Math.max(0, Math.min(100, parseFloat(String(formData.get("contingencyPct") ?? "0")) || 0));
  const validUntilRaw = String(formData.get("validUntil") ?? "").trim();
  await db.quote.update({
    where: { id: quoteId },
    data: {
      ...(title ? { title } : {}),
      taxRate,
      contingencyPct,
      notes,
      recipientName,
      recipientCity,
      intro,
      scope,
      deliverables,
      validUntil: validUntilRaw ? new Date(validUntilRaw) : null,
    },
  });
  refresh(quoteId);
}

// Agrega varias líneas a la cotización tomadas del CATÁLOGO interno (componer servicio).
// Cada selección lleva el id del ServiceItem y la cantidad elegida.
export async function addCatalogItems(quoteId: string, selections: { catalogItemId: string; quantity: number }[]) {
  await requirePerm("crear_cotizaciones");
  await ensureQuoteAccess(quoteId);
  await assertEditable(quoteId);
  const ids = selections.map((s) => s.catalogItemId);
  if (!ids.length) return;
  const cat = await db.serviceItem.findMany({ where: { id: { in: ids } } });
  const byId = new Map(cat.map((c) => [c.id, c]));
  let pos = await db.quoteItem.count({ where: { quoteId } });
  const data = selections
    .map((sel) => {
      const ci = byId.get(sel.catalogItemId);
      if (!ci) return null;
      const quantity = Math.max(0, Number.isFinite(sel.quantity) ? sel.quantity : ci.qty);
      return { quoteId, section: ci.section, description: ci.name, unit: ci.unit, quantity, unitPrice: ci.unitPrice, catalogItemId: ci.id, position: pos++ };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);
  if (data.length) await db.quoteItem.createMany({ data });
  refresh(quoteId);
}

// Copia el alcance y los entregables de la cotización al BRIEF del proyecto vinculado
// (lo que ve el equipo, sin valores ni equipos). Solo si la cotización tiene proyecto.
export async function copyQuoteBriefToProject(quoteId: string) {
  await requirePerm("crear_cotizaciones");
  await ensureQuoteAccess(quoteId);
  const q = await db.quote.findUnique({ where: { id: quoteId }, select: { projectId: true, scope: true, deliverables: true } });
  if (!q?.projectId) throw new Error("La cotización no está vinculada a un proyecto.");
  await db.project.update({
    where: { id: q.projectId },
    data: { briefScope: q.scope, briefDeliverables: q.deliverables },
  });
  revalidatePath(`/proyectos/${q.projectId}`);
  refresh(quoteId);
}

export async function addItem(quoteId: string) {
  await requirePerm("crear_cotizaciones");
  await ensureQuoteAccess(quoteId);
  await assertEditable(quoteId);
  const count = await db.quoteItem.count({ where: { quoteId } });
  await db.quoteItem.create({
    data: { quoteId, description: "", quantity: 1, unitPrice: 0, position: count },
  });
  refresh(quoteId);
}

export async function updateItem(
  itemId: string,
  data: { section?: string; description: string; unit?: string; quantity: number; unitPrice: number },
) {
  await requirePerm("crear_cotizaciones");
  const existing = await db.quoteItem.findUnique({ where: { id: itemId }, select: { quoteId: true } });
  if (!existing) return;
  await ensureQuoteAccess(existing.quoteId);
  await assertEditable(existing.quoteId);
  // cantidades y precios no negativos (evita totales manipulados)
  const quantity = Math.max(0, Number.isFinite(data.quantity) ? data.quantity : 0);
  const unitPrice = Math.max(0, Number.isFinite(data.unitPrice) ? data.unitPrice : 0);
  const section = (data.section ?? "").trim().slice(0, 60) || null;
  const unit = (data.unit ?? "").trim().slice(0, 24) || null;
  await db.quoteItem.update({
    where: { id: itemId },
    data: { section, description: data.description, unit, quantity, unitPrice },
  });
  refresh(existing.quoteId);
}

export async function removeItem(itemId: string) {
  await requirePerm("crear_cotizaciones");
  const existing = await db.quoteItem.findUnique({ where: { id: itemId }, select: { quoteId: true } });
  if (!existing) return;
  await ensureQuoteAccess(existing.quoteId);
  await assertEditable(existing.quoteId);
  await db.quoteItem.delete({ where: { id: itemId } });
  refresh(existing.quoteId);
}

// Cambiar estado. BORRADOR → crear_cotizaciones. ENVIADA → enviar_cotizaciones.
// APROBADA/RECHAZADA → aprobar_cotizaciones.
export async function setQuoteStatus(quoteId: string, status: string) {
  if (!QUOTE_STATUSES.includes(status)) throw new Error("Estado inválido");
  const needsApproval = status === "APROBADA" || status === "RECHAZADA";
  // Enviar al cliente exige enviar_cotizaciones (concedido a los mismos roles que tienen
  // crear_cotizaciones —gerente y ventas— por ROLE_DEFAULTS, así que no rompe el envío).
  const permKey = needsApproval
    ? "aprobar_cotizaciones"
    : status === "ENVIADA"
      ? "enviar_cotizaciones"
      : "crear_cotizaciones";
  const session = await requirePerm(permKey);
  await ensureQuoteAccess(quoteId);
  // Inmutabilidad: una cotización APROBADA no puede revertirse a otro estado salvo que el
  // actor tenga aprobar_cotizaciones; si no, un usuario sin permiso de aprobación podría
  // revertirla silenciosamente y borrar approvedBy/approvedAt.
  const current = await db.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
  if (current?.status === "APROBADA" && status !== "APROBADA" && !needsApproval) {
    await requirePerm("aprobar_cotizaciones");
  }
  await db.quote.update({
    where: { id: quoteId },
    data: {
      status: status as never,
      approvedById: status === "APROBADA" ? session.id : null,
      approvedAt: status === "APROBADA" ? new Date() : null,
    },
  });

  // Al APROBAR, si la cotización está ligada a un proyecto, llevamos el alcance y los
  // entregables al brief del proyecto para que el equipo arranque con la info (sin valores).
  if (status === "APROBADA") {
    const q = await db.quote.findUnique({ where: { id: quoteId }, select: { projectId: true, scope: true, deliverables: true } });
    if (q?.projectId && (q.scope || q.deliverables)) {
      await db.project.update({
        where: { id: q.projectId },
        data: { briefScope: q.scope, briefDeliverables: q.deliverables },
      });
      revalidatePath(`/proyectos/${q.projectId}`);
    }
  }
  refresh(quoteId);
}
