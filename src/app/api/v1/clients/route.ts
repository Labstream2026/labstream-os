import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/clients?q=texto — clientes que el titular puede ver. Requiere ver_clientes.
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (!hasPermission(ctx.session, "ver_clientes")) return apiJson({ ok: false, error: "Sin permiso para ver clientes (ver_clientes)." }, 403);
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const base = accessibleClientWhere(ctx.session);
  const where = q
    ? { AND: [base, { archivedAt: null, name: { contains: q, mode: "insensitive" as const } }] }
    : { AND: [base, { archivedAt: null }] };
  const rows = await db.client.findMany({
    where,
    take: 50,
    orderBy: { name: "asc" },
    select: { id: true, name: true, company: true, isActive: true, _count: { select: { projects: true } } },
  });
  return apiJson({
    ok: true,
    clients: rows.map((c) => ({ id: c.id, name: c.name, company: c.company ?? null, active: c.isActive, projects: c._count.projects })),
  });
});
