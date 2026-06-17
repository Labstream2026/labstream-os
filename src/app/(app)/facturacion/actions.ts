"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

async function requirePerm(key: string) {
  const session = await getSession();
  if (!hasPermission(session, key)) throw new Error("No autorizado");
  return session!;
}

function refresh(invoiceId?: string) {
  revalidatePath("/facturacion");
  revalidatePath("/reportes");
  if (invoiceId) revalidatePath(`/facturacion/${invoiceId}`);
}

async function nextCode(): Promise<string> {
  const count = await db.invoice.count();
  return `FAC-${String(count + 1).padStart(4, "0")}`;
}

// Genera una factura (snapshot) a partir de una cotización: copia ítems, IVA, moneda,
// cliente y proyecto. Vencimiento por defecto a 30 días.
export async function createInvoiceFromQuote(quoteId: string) {
  const session = await requirePerm("crear_cotizaciones");
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!quote) throw new Error("Cotización inexistente");

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const invoice = await db.invoice.create({
    data: {
      code: await nextCode(),
      status: "BORRADOR",
      currency: quote.currency,
      taxRate: quote.taxRate,
      notes: quote.notes,
      dueDate,
      clientId: quote.clientId,
      projectId: quote.projectId,
      quoteId: quote.id,
      createdById: session.id,
      items: {
        create: quote.items.map((i) => ({
          section: i.section,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          position: i.position,
        })),
      },
    },
  });
  await logActivity({ action: "invoice.create", summary: `generó la factura ${invoice.code} desde ${quote.code}`, clientId: quote.clientId, entityType: "invoice", entityId: invoice.id });
  refresh(invoice.id);
  redirect(`/facturacion/${invoice.id}`);
}

const VALID = ["BORRADOR", "ENVIADA", "PAGADA", "VENCIDA", "ANULADA"];

export async function setInvoiceStatus(invoiceId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  await requirePerm("aprobar_cotizaciones");
  if (!VALID.includes(status)) return { ok: false, error: "Estado inválido" };
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, select: { code: true, clientId: true } });
  if (!inv) return { ok: false, error: "Factura inexistente" };
  await db.invoice.update({
    where: { id: invoiceId },
    data: { status: status as never, paidAt: status === "PAGADA" ? new Date() : null },
  });
  await logActivity({ action: "invoice.status", summary: `marcó la factura ${inv.code} como ${status.toLowerCase()}`, clientId: inv.clientId, entityType: "invoice", entityId: invoiceId });
  refresh(invoiceId);
  return { ok: true };
}

export async function updateInvoiceMeta(invoiceId: string, formData: FormData): Promise<void> {
  await requirePerm("crear_cotizaciones");
  const issueRaw = String(formData.get("issueDate") ?? "").trim();
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const taxRaw = String(formData.get("taxRate") ?? "").trim();
  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      issueDate: issueRaw ? new Date(`${issueRaw}T12:00:00.000Z`) : undefined,
      dueDate: dueRaw ? new Date(`${dueRaw}T12:00:00.000Z`) : null,
      taxRate: taxRaw ? Math.max(0, Math.min(100, parseInt(taxRaw, 10) || 0)) : undefined,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  refresh(invoiceId);
}

export async function deleteInvoice(invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Solo un administrador puede borrar facturas." };
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, select: { code: true, clientId: true } });
  if (!inv) return { ok: true };
  await db.invoice.delete({ where: { id: invoiceId } });
  await logActivity({ action: "invoice.delete", summary: `eliminó la factura ${inv.code}`, clientId: inv.clientId, entityType: "invoice" });
  refresh();
  redirect("/facturacion");
}
