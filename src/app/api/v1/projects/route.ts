import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { accessibleProjectWhere } from "@/lib/project-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/projects?q=texto — proyectos que el titular puede ver (acotado por accessibleProjectWhere).
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const base = accessibleProjectWhere(ctx.session);
  const where = q ? { AND: [base, { name: { contains: q, mode: "insensitive" as const } }] } : base;
  const rows = await db.project.findMany({
    where,
    take: 50,
    orderBy: { updatedAt: "desc" },
    select: { id: true, code: true, name: true, status: true, progress: true, dueDate: true, client: { select: { name: true } }, lead: { select: { name: true } } },
  });
  return apiJson({
    ok: true,
    projects: rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      client: p.client?.name ?? null,
      status: p.status,
      progress: p.progress,
      dueDate: p.dueDate ? p.dueDate.toISOString().slice(0, 10) : null,
      lead: p.lead?.name ?? null,
    })),
  });
});
