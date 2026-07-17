import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { signProposalToken } from "@/lib/proposals/token";
import { effectiveStatus, BRAND_DEFAULT, type Block, type Brand, type ProposalStatus } from "@/lib/proposals/types";
import { ProposalEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function PropuestaEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "ver_finanzas")) redirect("/");
  if (!hasPermission(session, "crear_cotizaciones")) redirect("/cotizaciones");

  const [p, clients] = await Promise.all([
    db.proposal.findUnique({ where: { id } }),
    db.client.findMany({ where: accessibleClientWhere(session), orderBy: { name: "asc" }, select: { id: true, name: true, emoji: true } }),
  ]);
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
      initialClientId={p.clientId ?? ""}
      initialHasPassword={p.accessPasswordHash != null}
      acceptance={p.acceptedAt ? { name: p.acceptedByName, email: p.acceptedByEmail, at: new Date(p.acceptedAt).toISOString() } : null}
      clients={clients.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))}
      publicUrl={publicUrl}
    />
  );
}
