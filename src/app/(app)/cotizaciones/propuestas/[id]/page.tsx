import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { signProposalToken } from "@/lib/proposals/token";
import { effectiveStatus, BRAND_DEFAULT, type Block, type Brand, type ProposalStatus } from "@/lib/proposals/types";
import { ProposalEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function PropuestaEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "ver_cotizaciones")) redirect("/");
  if (!hasPermission(session, "crear_cotizaciones")) redirect("/cotizaciones");

  const p = await db.proposal.findUnique({ where: { id } });
  if (!p) notFound();

  const brand = { ...BRAND_DEFAULT, ...((p.brand as unknown as Brand) ?? {}) };
  const blocks = (Array.isArray(p.blocks) ? p.blocks : []) as unknown as Block[];
  const expiresAt = p.expiresAt ? new Date(p.expiresAt).toISOString().slice(0, 10) : "";
  const status = effectiveStatus({ status: p.status as ProposalStatus, expiresAt: p.expiresAt });
  const publicUrl = `/p/${signProposalToken(p.id)}`;

  return (
    <ProposalEditor
      id={p.id}
      code={p.code}
      initialTitle={p.title}
      initialBlocks={blocks}
      initialBrand={brand}
      initialStatus={status}
      initialExpiresAt={expiresAt}
      publicUrl={publicUrl}
    />
  );
}
