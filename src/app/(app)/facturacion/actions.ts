"use server";

import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { logActivity } from "@/lib/activity";
import { createOrGetInvoiceForQuote } from "@/lib/invoice-from-quote";
import { isInvoiceStatus } from "@/lib/enum-guards";

async function requirePerm(key: string) {
  const session = await getSession();
  if (!hasPermission(session, key)) noAutorizado();
  return session!;
}

// El usuario debe poder acceder al cliente de la factura, además del permiso global.
async function ensureInvoiceAccess(invoiceId: string): Promise<string | null> {
  const session = await getSession();
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, select: { code: true, clientId: true } });
  if (!inv) return null;
  if (!(await userCanAccessClient(inv.clientId, session))) noAutorizado();
  return inv.code;
}

function refresh(invoiceId?: string) {
  revalidatePath("/facturacion");
  revalidatePath("/reportes");
  if (invoiceId) revalidatePath(`/facturacion/${invoiceId}`);
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
  if (!(await userCanAccessClient(quote.clientId, session))) noAutorizado();
  // Solo se factura una cotización APROBADA (no basta con que el botón esté oculto:
  // la acción puede invocarse directamente).
  if (quote.status !== "APROBADA") throw new Error("Solo se puede facturar una cotización aprobada.");

  // A prueba de DOBLE FACTURACIÓN: el check «¿ya existe factura para esta cotización?» + el
  // create van serializados con advisory-lock dentro del helper. Si ya existía (doble submit,
  // re-render, reintento de agente), se devuelve la misma factura sin crear otra FAC distinta.
  const { invoice, alreadyExisted } = await createOrGetInvoiceForQuote(quote, session.id);
  if (!alreadyExisted) {
    await logActivity({ action: "invoice.create", summary: `generó la factura ${invoice.code} desde ${quote.code}`, clientId: quote.clientId, entityType: "invoice", entityId: invoice.id });
    refresh(invoice.id);
  }
  // Documento unificado: volvemos a la cotización (pestaña "Facturado" muestra la factura).
  redirect(`/cotizaciones/${quoteId}`);
}

export async function setInvoiceStatus(invoiceId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  await requirePerm("aprobar_cotizaciones");
  if (!isInvoiceStatus(status)) return { ok: false, error: "Estado inválido" };
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, select: { code: true, clientId: true } });
  if (!inv) return { ok: false, error: "Factura inexistente" };
  const session = await getSession();
  if (!(await userCanAccessClient(inv.clientId, session))) return { ok: false, error: "No autorizado" };
  await db.invoice.update({
    where: { id: invoiceId },
    data: { status, paidAt: status === "PAGADA" ? new Date() : null },
  });
  await logActivity({ action: "invoice.status", summary: `marcó la factura ${inv.code} como ${status.toLowerCase()}`, clientId: inv.clientId, entityType: "invoice", entityId: invoiceId });
  refresh(invoiceId);
  return { ok: true };
}

export async function updateInvoiceMeta(invoiceId: string, formData: FormData): Promise<void> {
  await requirePerm("crear_cotizaciones");
  await ensureInvoiceAccess(invoiceId);
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, code: true, clientId: true } });
  if (!inv) return;
  // CANDADO DE ESTADO: una factura EMITIDA (ENVIADA/PAGADA/ANULADA) es un documento contable; editar
  // el IVA cambiaría el total ya facturado/cobrado (el total se calcula de taxRate, no se guarda).
  // Solo los BORRADORES son editables, igual que las cotizaciones se bloquean al aprobarse.
  if (inv.status !== "BORRADOR") throw new Error("La factura ya fue emitida; no se puede editar. Anúlala y crea una nueva si necesitas cambios.");
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
  await logActivity({ action: "invoice.update", summary: `editó los datos de la factura ${inv.code}`, clientId: inv.clientId, entityType: "invoice", entityId: invoiceId });
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
