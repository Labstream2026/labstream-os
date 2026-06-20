"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { logActivity } from "@/lib/activity";
import { clientLineValue } from "@/lib/quote-compose";
import { createWithSequentialCode, maxCodeFrom } from "@/lib/sequential-code";

async function requirePerm(key: string) {
  const session = await getSession();
  if (!hasPermission(session, key)) throw new Error("No autorizado");
  return session!;
}

// El usuario debe poder acceder al cliente de la factura, además del permiso global.
async function ensureInvoiceAccess(invoiceId: string): Promise<string | null> {
  const session = await getSession();
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, select: { code: true, clientId: true } });
  if (!inv) return null;
  if (!(await userCanAccessClient(inv.clientId, session))) throw new Error("No autorizado");
  return inv.code;
}

function refresh(invoiceId?: string) {
  revalidatePath("/facturacion");
  revalidatePath("/reportes");
  if (invoiceId) revalidatePath(`/facturacion/${invoiceId}`);
}

// Código FAC-#### a prueba de colisiones (deriva del máximo + reintento ante P2002).
const nextInvoiceMax = () => maxCodeFrom((args) => db.invoice.findMany(args));

// Genera una factura (snapshot) a partir de una cotización: copia ítems, IVA, moneda,
// cliente y proyecto. Vencimiento por defecto a 30 días.
export async function createInvoiceFromQuote(quoteId: string) {
  const session = await requirePerm("crear_cotizaciones");
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!quote) throw new Error("Cotización inexistente");
  if (!(await userCanAccessClient(quote.clientId, session))) throw new Error("No autorizado");

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);

  const invoice = await createWithSequentialCode({
    prefix: "FAC",
    findMaxCode: nextInvoiceMax,
    create: (code) =>
      db.invoice.create({
        data: {
          code,
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
            // Se factura el PRECIO AL CLIENTE (con el imprevisto ya incluido), igual que la
            // cotización aprobada. Cada concepto va como una línea con su valor final exacto;
            // la cantidad/unidad original queda en la descripción para que se lea claro.
            create: quote.items.map((i) => {
              const value = clientLineValue({ quantity: i.quantity, unitPrice: i.unitPrice }, quote.contingencyPct);
              const qtyNote = i.quantity !== 1 ? ` (×${i.quantity}${i.unit ? ` ${i.unit}` : ""})` : "";
              return {
                section: i.section,
                description: `${i.description}${qtyNote}`,
                quantity: 1,
                unitPrice: value,
                position: i.position,
              };
            }),
          },
        },
      }),
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
  const session = await getSession();
  if (!(await userCanAccessClient(inv.clientId, session))) return { ok: false, error: "No autorizado" };
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
  await ensureInvoiceAccess(invoiceId);
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
