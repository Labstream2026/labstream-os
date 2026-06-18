"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { verifyQuoteToken } from "@/lib/quote-token";
import { rateLimit } from "@/lib/rate-limit";

// Clave de rate-limit a partir del token (autorización del portal) y, si está disponible,
// la IP. Evita que un token filtrado se use para inundar la BD.
async function rlKey(token: string): Promise<string> {
  let ip = "";
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "";
  } catch {
    /* headers() no disponible */
  }
  return `${token}:${ip}`;
}

// Acción del portal PÚBLICO de cotización. La autorización es el token firmado
// (no hay sesión); el quoteId se deriva del token, nunca del cliente.
export async function respondQuote(token: string, decision: string) {
  if (!rateLimit(`respond-quote:${await rlKey(token)}`, 20, 60_000)) {
    throw new Error("Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.");
  }
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
