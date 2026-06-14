"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";

async function requirePerm(key: string) {
  const session = await getSession();
  if (!hasPermission(session, key)) throw new Error("No autorizado");
  return session!;
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
  await requirePerm("crear_cotizaciones");
  const title = String(formData.get("title") ?? "").trim() || "Cotización sin título";
  const clientId = String(formData.get("clientId") ?? "");
  const projectId = String(formData.get("projectId") ?? "") || null;
  if (!clientId) throw new Error("Falta el cliente");

  const quote = await db.quote.create({
    data: {
      code: await nextCode(),
      title,
      clientId,
      projectId,
      createdById: (await getSession())!.id,
      items: { create: [{ description: "", quantity: 1, unitPrice: 0, position: 0 }] },
    },
  });
  refresh(quote.id);
  redirect(`/cotizaciones/${quote.id}`);
}

export async function updateQuoteMeta(quoteId: string, formData: FormData) {
  await requirePerm("crear_cotizaciones");
  await assertEditable(quoteId);
  const title = String(formData.get("title") ?? "").trim();
  const taxRate = Math.max(0, Math.min(100, parseInt(String(formData.get("taxRate") ?? "0"), 10) || 0));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const validUntilRaw = String(formData.get("validUntil") ?? "").trim();
  await db.quote.update({
    where: { id: quoteId },
    data: {
      ...(title ? { title } : {}),
      taxRate,
      notes,
      validUntil: validUntilRaw ? new Date(validUntilRaw) : null,
    },
  });
  refresh(quoteId);
}

export async function addItem(quoteId: string) {
  await requirePerm("crear_cotizaciones");
  await assertEditable(quoteId);
  const count = await db.quoteItem.count({ where: { quoteId } });
  await db.quoteItem.create({
    data: { quoteId, description: "", quantity: 1, unitPrice: 0, position: count },
  });
  refresh(quoteId);
}

export async function updateItem(
  itemId: string,
  data: { description: string; quantity: number; unitPrice: number },
) {
  await requirePerm("crear_cotizaciones");
  const existing = await db.quoteItem.findUnique({ where: { id: itemId }, select: { quoteId: true } });
  if (!existing) return;
  await assertEditable(existing.quoteId);
  // cantidades y precios no negativos (evita totales manipulados)
  const quantity = Math.max(0, Number.isFinite(data.quantity) ? data.quantity : 0);
  const unitPrice = Math.max(0, Number.isFinite(data.unitPrice) ? data.unitPrice : 0);
  await db.quoteItem.update({
    where: { id: itemId },
    data: { description: data.description, quantity, unitPrice },
  });
  refresh(existing.quoteId);
}

export async function removeItem(itemId: string) {
  await requirePerm("crear_cotizaciones");
  const existing = await db.quoteItem.findUnique({ where: { id: itemId }, select: { quoteId: true } });
  if (!existing) return;
  await assertEditable(existing.quoteId);
  await db.quoteItem.delete({ where: { id: itemId } });
  refresh(existing.quoteId);
}

// Cambiar estado. BORRADOR/ENVIADA → crear_cotizaciones. APROBADA/RECHAZADA → aprobar_cotizaciones.
export async function setQuoteStatus(quoteId: string, status: string) {
  if (!QUOTE_STATUSES.includes(status)) throw new Error("Estado inválido");
  const needsApproval = status === "APROBADA" || status === "RECHAZADA";
  const session = await requirePerm(needsApproval ? "aprobar_cotizaciones" : "crear_cotizaciones");
  await db.quote.update({
    where: { id: quoteId },
    data: {
      status: status as never,
      approvedById: status === "APROBADA" ? session.id : null,
      approvedAt: status === "APROBADA" ? new Date() : null,
    },
  });
  refresh(quoteId);
}
