import { db } from "@/lib/db";
import { clientLineValue } from "@/lib/quote-compose";
import { createWithSequentialCode, maxCodeFrom } from "@/lib/sequential-code";

// Cotización (con ítems) mínima que necesita la facturación. Estructural a propósito para no
// acoplar el helper al tipo generado de Prisma (mismo criterio que el resto del dominio).
type QuoteForInvoice = {
  id: string;
  currency: string;
  taxRate: number;
  notes: string | null;
  clientId: string;
  projectId: string | null;
  contingencyPct: number;
  items: {
    section: string | null;
    description: string;
    unit: string | null;
    quantity: number;
    unitPrice: number;
    position: number;
  }[];
};

export type CreatedInvoice = { id: string; code: string; status: string };
export type InvoiceForQuoteResult = { invoice: CreatedInvoice; alreadyExisted: boolean };

// Crea (o recupera) la ÚNICA factura de una cotización, a prueba de DOBLE FACTURACIÓN.
//
// El bug: `findFirst({quoteId})` seguido de `create` NO es atómico. Dos peticiones simultáneas
// (doble submit, re-render, reintento de un agente) veían ambas `findFirst=null` y creaban DOS
// facturas FAC-#### para la MISMA cotización → se cobraría dos veces. `Invoice.quoteId` no es
// @unique, así que la BD no lo impide.
//
// El fix (sin migración): el check + create van DENTRO de una transacción que primero toma un
// advisory-lock. Dos peticiones se serializan: la primera crea, la segunda ve la factura ya
// existente y la devuelve sin crear otra. Mismo patrón que el consecutivo de entregables
// (pg_advisory_xact_lock, commit 4a9dca8), que se libera al hacer commit.
//
// El lock es GLOBAL de creación de facturas (no por-cotización) A PROPÓSITO: el consecutivo
// FAC-#### es una secuencia global, así que un único lock serializa a la vez el «¿ya existe
// factura para esta cotización?» y la asignación del código. Si fuera por-cotización, dos
// cotizaciones distintas facturadas a la vez podrían chocar en el índice único de `code` DENTRO
// de sus transacciones, y ese P2002 dejaría la transacción abortada (envenenada), rompiendo el
// reintento de createWithSequentialCode. Con el lock global no hay colisión de código ni carrera
// de duplicado. El volumen de facturación es bajo, así que serializar la creación no cuesta nada.
export async function createOrGetInvoiceForQuote(quote: QuoteForInvoice, createdById: string): Promise<InvoiceForQuoteResult> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"invoice:create"}, 0))`;
      // Re-chequeo AUTORITATIVO ya bajo el lock: si otra petición ya la creó, la devolvemos.
      const existing = await tx.invoice.findFirst({
        where: { quoteId: quote.id },
        select: { id: true, code: true, status: true },
      });
      if (existing) return { invoice: existing, alreadyExisted: true };

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const invoice = await createWithSequentialCode({
        prefix: "FAC",
        findMaxCode: () => maxCodeFrom((args) => tx.invoice.findMany(args)),
        create: (code) =>
          tx.invoice.create({
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
              createdById,
              items: {
                // Se factura el PRECIO AL CLIENTE (imprevisto ya incluido), igual que la cotización
                // aprobada. La cantidad/unidad original queda en la descripción para que se lea claro.
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
            select: { id: true, code: true, status: true },
          }),
      });
      return { invoice, alreadyExisted: false };
    },
    // Holgura amplia: la creación con ítems anidados corre bajo el lock global; con este volumen
    // no hay contención real, pero damos margen por si varias facturaciones llegan en ráfaga.
    { timeout: 15000 },
  );
}
