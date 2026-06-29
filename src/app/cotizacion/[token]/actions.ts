"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { verifyQuoteToken } from "@/lib/quote-token";
import { rateLimit } from "@/lib/rate-limit";
import { notifyAndEmail } from "@/lib/notify";

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

  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    select: { status: true, validUntil: true, clientDecision: true, code: true, title: true, createdById: true, client: { select: { name: true } } },
  });
  if (!quote) throw new Error("Cotización inexistente");
  // Solo se responde UNA vez, y nunca si el equipo ya cerró la cotización.
  if (quote.clientDecision || quote.status === "APROBADA" || quote.status === "RECHAZADA") return;
  // Una cotización con fecha de validez pasada ya no se puede aceptar ni rechazar.
  if (quote.validUntil && new Date(quote.validUntil).getTime() < Date.now()) throw new Error("La cotización venció");

  const accepted = decision === "APROBADA" || decision === "ACEPTADA";
  await db.quote.update({
    where: { id: quoteId },
    data: {
      // Decisión DEL CLIENTE, separada de la aprobación interna: aceptar NO pone APROBADA
      // (eso lo hace el equipo con aprobar_cotizaciones, y es lo único que dispara la
      // facturación). Rechazar sí cierra la cotización, porque no queda nada que aprobar.
      clientDecision: accepted ? "ACEPTADA" : "RECHAZADA",
      clientDecidedAt: new Date(),
      ...(accepted ? {} : { status: "RECHAZADA" as never }),
    },
  });
  // Avisar al creador: que la apruebe internamente (si la aceptaron) o que sepa del rechazo.
  if (quote.createdById) {
    const who = quote.client?.name ?? "El cliente";
    await notifyAndEmail(quote.createdById, {
      type: "quote",
      title: accepted ? `✅ Cliente aceptó la cotización ${quote.code}` : `Cliente rechazó la cotización ${quote.code}`,
      body: accepted ? `${who} aceptó «${quote.title}». Apruébala internamente para poder facturar.` : `${who} rechazó «${quote.title}».`,
      link: `/cotizaciones/${quoteId}`,
    }).catch(() => null);
  }
  revalidatePath(`/cotizacion/${token}`);
  revalidatePath(`/cotizaciones/${quoteId}`);
  revalidatePath("/cotizaciones");
}
