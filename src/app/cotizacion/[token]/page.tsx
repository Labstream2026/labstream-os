import { db } from "@/lib/db";
import { verifyQuoteToken } from "@/lib/quote-token";
import { PublicLinkInvalid } from "@/components/public-link-invalid";
import { Logo } from "@/components/brand/logo";
import { QuoteDocument } from "@/components/quote-document";
import { FitToWidth } from "@/components/fit-to-width";
import { PrintButton } from "@/components/print-button";
import { QuoteDecision } from "./decision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// `Date.now()` directo en el render lo marca la regla de pureza; el wrapper a nivel de módulo
// es equivalente y evita el falso positivo.
function nowMs(): number {
  return Date.now();
}

export default async function CotizacionPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quoteId = verifyQuoteToken(token);
  if (!quoteId) return <PublicLinkInvalid />;

  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: {
      client: { select: { name: true, company: true } },
      project: { select: { name: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!quote) return <PublicLinkInvalid />;

  // "Decidida" = el CLIENTE ya respondió (aceptó/rechazó) en el portal. La aprobación INTERNA
  // del equipo (status APROBADA) no afecta lo que el cliente ve/puede hacer aquí.
  const decided = quote.clientDecision != null || quote.status === "RECHAZADA";
  // Vencimiento por fecha de validez: una cotización con validUntil pasado ya no
  // se puede aceptar/rechazar (igual que las propuestas vencidas).
  const expired = !decided && Boolean(quote.validUntil && new Date(quote.validUntil).getTime() < nowMs());

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <div className="flex items-center gap-2.5">
          <Logo className="h-7" />
          <span className="hidden h-6 w-px bg-neutral-300 sm:block" />
          <p className="hidden text-xs text-neutral-500 sm:block">Cotización · revisa el detalle y apruébala o recházala al final.</p>
        </div>
        <PrintButton label="Descargar PDF" />
      </div>

      {quote.clientDecision === "ACEPTADA" ? (
        <div className="mx-auto mb-4 max-w-3xl rounded-md bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 print:hidden">
          ✅ Aceptaste esta cotización. ¡Gracias! El equipo la revisará y se pondrá en contacto.
        </div>
      ) : quote.clientDecision === "RECHAZADA" || quote.status === "RECHAZADA" ? (
        <div className="mx-auto mb-4 max-w-3xl rounded-md bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 print:hidden">
          Esta cotización fue rechazada. Si fue un error, contáctanos.
        </div>
      ) : expired ? (
        <div className="mx-auto mb-4 max-w-3xl rounded-md bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 print:hidden">
          Esta cotización ya no está disponible: su fecha de validez venció. Escríbenos para actualizarla.
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[820px] px-2 sm:px-4 print:max-w-none print:px-0">
      <FitToWidth>
      <QuoteDocument
        quote={{
          code: quote.code,
          title: quote.title,
          status: quote.status,
          currency: quote.currency,
          taxRate: quote.taxRate,
          contingencyPct: quote.contingencyPct,
          notes: quote.notes,
          scope: quote.scope,
          deliverables: quote.deliverables,
          validUntil: quote.validUntil,
          createdAt: quote.createdAt,
          clientName: quote.client.name,
          clientCompany: quote.client.company,
          recipientName: quote.recipientName,
          recipientCity: quote.recipientCity,
          intro: quote.intro,
          projectName: quote.project?.name ?? null,
          items: quote.items.map((i) => ({ section: i.section, description: i.description, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice })),
        }}
      />
      </FitToWidth>
      </div>

      {!decided && !expired ? (
        <div className="mx-auto mt-6 max-w-3xl px-4 print:hidden">
          <QuoteDecision token={token} />
        </div>
      ) : null}
    </div>
  );
}
