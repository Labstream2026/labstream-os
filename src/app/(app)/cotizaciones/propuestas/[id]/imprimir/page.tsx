import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { BRAND_DEFAULT, type Block, type Brand } from "@/lib/proposals/types";
import { ProposalRenderer } from "../../proposal-renderer";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function ImprimirPropuestaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "ver_cotizaciones")) redirect("/");

  const p = await db.proposal.findUnique({ where: { id } });
  if (!p) notFound();

  const brand = { ...BRAND_DEFAULT, ...((p.brand as unknown as Brand) ?? {}) };
  const blocks = (Array.isArray(p.blocks) ? p.blocks : []) as unknown as Block[];

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-4 print:hidden">
        <p className="text-sm font-semibold text-neutral-700">{p.code} · {p.title}</p>
        <PrintButton label="Descargar PDF" />
      </div>
      <div className="mx-auto max-w-3xl bg-white px-4 py-6 print:max-w-none print:px-0">
        <ProposalRenderer blocks={blocks} brand={brand} />
      </div>
    </div>
  );
}
