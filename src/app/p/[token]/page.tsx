import { db } from "@/lib/db";
import { verifyProposalToken } from "@/lib/proposals/token";
import { PublicLinkInvalid } from "@/components/public-link-invalid";
import { effectiveStatus, BRAND_DEFAULT, type Block, type Brand, type ProposalStatus } from "@/lib/proposals/types";
import { ProposalRenderer } from "@/app/(app)/cotizaciones/propuestas/proposal-renderer";
import { PrintButton } from "@/components/print-button";
import { AcceptProposal } from "./accept";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PropuestaPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = verifyProposalToken(token);
  if (!id) return <PublicLinkInvalid />;

  const p = await db.proposal.findUnique({ where: { id } });
  if (!p) return <PublicLinkInvalid />;

  // Cuenta una visita del cliente (no bloquea el render si falla).
  await db.proposal.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {});

  const brand = { ...BRAND_DEFAULT, ...((p.brand as unknown as Brand) ?? {}) };
  const blocks = (Array.isArray(p.blocks) ? p.blocks : []) as unknown as Block[];
  const status = effectiveStatus({ status: p.status as ProposalStatus, expiresAt: p.expiresAt });
  const accepted = status === "ACEPTADA";
  const expired = status === "VENCIDA";

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <div>
          <p className="text-sm font-semibold text-neutral-800">{brand.company}</p>
          <p className="text-xs text-neutral-500">{brand.tagline}</p>
        </div>
        <PrintButton label="Descargar PDF" />
      </div>

      {accepted ? (
        <div className="mx-auto mb-4 max-w-3xl rounded-md bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 print:hidden">
          ✅ Aceptaste esta propuesta. ¡Gracias! Nos pondremos en contacto.
        </div>
      ) : expired ? (
        <div className="mx-auto mb-4 max-w-3xl rounded-md bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 print:hidden">
          Esta propuesta venció. Escríbenos para actualizarla.
        </div>
      ) : null}

      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-4 shadow-sm print:rounded-none print:p-0 print:shadow-none sm:p-8">
        <ProposalRenderer blocks={blocks} brand={brand} />
      </div>

      {!accepted && !expired ? (
        <div className="mx-auto mt-6 max-w-3xl px-4 print:hidden">
          <AcceptProposal token={token} accent={brand.accent} />
        </div>
      ) : null}
    </div>
  );
}
