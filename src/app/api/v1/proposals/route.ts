import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/proposals?status= — propuestas de clientes accesibles (o propias sin cliente).
// Gestionadas por el equipo comercial: gate crear_cotizaciones.
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (!hasPermission(ctx.session, "crear_cotizaciones")) return apiJson({ ok: false, error: "Sin permiso (crear_cotizaciones)." }, 403);
  const status = new URL(req.url).searchParams.get("status")?.toUpperCase();
  const scope = ctx.session.role === "admin"
    ? {}
    : { OR: [{ client: accessibleClientWhere(ctx.session) }, { createdById: ctx.session.id }] };
  const filters: Record<string, unknown>[] = [scope];
  if (status && ["BORRADOR", "ENVIADA", "ACEPTADA", "VENCIDA"].includes(status)) filters.push({ status });
  const rows = await db.proposal.findMany({
    where: { AND: filters }, take: 50, orderBy: { updatedAt: "desc" },
    select: { id: true, code: true, title: true, status: true, views: true, expiresAt: true, updatedAt: true, client: { select: { id: true, name: true } } },
  });
  return apiJson({ ok: true, proposals: rows.map((p) => ({ id: p.id, code: p.code, title: p.title, status: p.status, views: p.views, client: p.client ? { id: p.client.id, name: p.client.name } : null, expiresAt: p.expiresAt ? p.expiresAt.toISOString().slice(0, 10) : null, updatedAt: p.updatedAt.toISOString() })) });
});
