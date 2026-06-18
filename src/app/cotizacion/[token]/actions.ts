"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { verifyQuoteToken } from "@/lib/quote-token";

// Acción del portal PÚBLICO de cotización. La autorización es el token firmado
// (no hay sesión); el quoteId se deriva del token, nunca del cliente.
export async function respondQuote(token: string, decision: string) {
  const quoteId = verifyQuoteToken(token);
  if (!quoteId) throw new Error("Enlace inválido");

  const quote = await db.quote.findUnique({ where: { id: quoteId }, select: { status: true, validUntil: true } });
  if (!quote) throw new Error("Cotización inexistente");
  // Solo se puede responder una cotización aún no decidida.
  if (quote.status === "APROBADA" || quote.status === "RECHAZADA") return;
  // Una cotización con fecha de validez pasada ya no se puede aprobar ni rechazar.
  if (quote.validUntil && new Date(quote.validUntil).getTime() < Date.now()) throw new Error("La cotización venció");

  const status = decision === "APROBADA" ? "APROBADA" : "RECHAZADA";
  await db.quote.update({
    where: { id: quoteId },
    data: {
      status: status as never,
      approvedAt: status === "APROBADA" ? new Date() : null,
    },
  });
  revalidatePath(`/cotizacion/${token}`);
  revalidatePath(`/cotizaciones/${quoteId}`);
  revalidatePath("/cotizaciones");
}
