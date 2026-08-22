import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { BRAND_DEFAULT, type Block, type Brand } from "@/lib/proposals/types";
import { sanitizeBlockBodies } from "@/lib/proposals/html-sanitize";
import { DeckView } from "@/components/proposals/deck-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Vista previa del DECK para el EQUIPO (la que el editor muestra en un iframe). Fuera del layout
// de la app —a propósito— para que el deck ocupe toda la ventana sin la barra lateral. Solo
// equipo con ver_finanzas; el cliente ve el deck por su portal firmado /p/[token].
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DeckPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "ver_finanzas")) redirect("/");

  const p = await db.proposal.findUnique({ where: { id }, select: { brand: true, blocks: true } });
  if (!p) notFound();

  const brand = { ...BRAND_DEFAULT, ...((p.brand as unknown as Brand) ?? {}) };
  const blocks = sanitizeBlockBodies((Array.isArray(p.blocks) ? p.blocks : []) as unknown as Block[]);

  return <DeckView blocks={blocks} brand={brand} />;
}
