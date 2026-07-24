import { db } from "@/lib/db";
import { createWithSequentialCode, maxCodeFrom } from "@/lib/sequential-code";
import { quoteDraftFromBlocks } from "@/lib/proposals/quote-draft";

// ── Puente propuesta → cotización ──
//
// Era el hueco central del sistema: una propuesta aceptada no llevaba a ningún lado y alguien
// tenía que RETECLEAR a mano todo el desglose en una cotización. Aquí ese desglose viaja solo.
//
// De la cotización a la factura el camino ya existía (lib/invoice-from-quote.ts), así que con
// este eslabón la cadena queda completa: propuesta → cotización → factura.
//
// Qué valor viaja: SIEMPRE el precio que el cliente aceptó (con su descuento aplicado), nunca
// el costo interno. El desglose interno solo sirve para REPARTIR ese precio entre los conceptos,
// manteniendo la proporción; así la cotización conserva la estructura del trabajo y su total
// coincide, al peso, con lo que el cliente vio.

type ProposalForQuote = {
  id: string;
  code: string;
  title: string;
  clientId: string | null;
  expiresAt: Date | null;
  quoteId: string | null;
  blocks: unknown;
};

export type QuoteFromProposalResult =
  | { ok: true; quote: { id: string; code: string }; alreadyExisted: boolean }
  | { ok: false; error: string };

// Crea (o recupera) la ÚNICA cotización de una propuesta.
//
// Idempotente a prueba de doble clic: el «¿ya tiene cotización?» y la creación van dentro de una
// transacción que primero toma un advisory-lock, igual que la facturación (invoice-from-quote).
// El lock es el GLOBAL de creación de cotizaciones porque el consecutivo COT-#### es una
// secuencia global: así dos conversiones simultáneas no chocan en el índice único del código.
export async function createOrGetQuoteForProposal(p: ProposalForQuote, createdById: string): Promise<QuoteFromProposalResult> {
  if (!p.clientId) {
    return { ok: false, error: "Vincula la propuesta a un cliente antes de convertirla: la cotización va a nombre de alguien." };
  }
  const draft = quoteDraftFromBlocks(p.blocks);
  if (!draft) {
    return { ok: false, error: "Esta propuesta no tiene un bloque de inversión con valores. Añádelo (o pon el precio al cliente) y vuelve a intentarlo." };
  }

  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"quote:create"}, 0))`;
      // Re-chequeo autoritativo bajo el lock: si otra petición ya la creó, se devuelve esa.
      const fresh = await tx.proposal.findUnique({ where: { id: p.id }, select: { quoteId: true } });
      if (fresh?.quoteId) {
        const existing = await tx.quote.findUnique({ where: { id: fresh.quoteId }, select: { id: true, code: true } });
        if (existing) return { ok: true as const, quote: existing, alreadyExisted: true };
        // Apuntaba a una cotización borrada: se limpia y se crea una nueva.
      }

      const quote = await createWithSequentialCode({
        prefix: "COT",
        findMaxCode: () => maxCodeFrom((args) => tx.quote.findMany(args)),
        create: (code) =>
          tx.quote.create({
            data: {
              code,
              title: p.title,
              status: "BORRADOR",
              currency: draft.currency,
              taxRate: draft.taxRate,
              // 0 A PROPÓSITO: el precio que viaja YA es el de cara al cliente (el imprevisto
              // se consideró al fijarlo en la propuesta). Volver a aplicarlo inflaría el total
              // por encima de lo que el cliente aceptó.
              contingencyPct: 0,
              validUntil: p.expiresAt,
              clientId: p.clientId!,
              notes: `Nace de la propuesta ${p.code}.`,
              createdById,
              items: {
                create: draft.lines.map((l, i) => ({
                  section: l.section,
                  description: l.description,
                  unit: "servicio",
                  quantity: 1,
                  unitPrice: l.unitPrice,
                  position: i,
                })),
              },
            },
            select: { id: true, code: true },
          }),
      });

      await tx.proposal.update({ where: { id: p.id }, data: { quoteId: quote.id } });
      return { ok: true as const, quote, alreadyExisted: false };
    },
    { timeout: 15000 },
  );
}
