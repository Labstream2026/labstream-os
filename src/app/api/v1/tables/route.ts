import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canAccessProject } from "@/lib/project-access";
import { canSeeWiki } from "@/lib/wiki-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/tables — tablas de datos visibles: las de proyectos accesibles y las de la wiki/sistema
// (sys:inventario, etc.) si el titular tiene ver_wiki. Solo metadatos + conteos; el detalle va aparte.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext) => {
  const wiki = await canSeeWiki(ctx.session);
  const rows = await db.dataTable.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, key: true, projectId: true, wikiPageId: true,
      project: { select: { isPrivate: true, leadId: true, archivedAt: true, members: { select: { userId: true, role: true } }, client: { select: { members: { select: { userId: true, role: true } } } } } },
      _count: { select: { columns: true, rows: true } },
    },
  });
  const visible = rows.filter((t) => (t.project ? !t.project.archivedAt && canAccessProject(t.project, ctx.session) : wiki));
  return apiJson({ ok: true, tables: visible.map((t) => ({ id: t.id, name: t.name, key: t.key, projectId: t.projectId, wikiPageId: t.wikiPageId, columns: t._count.columns, rows: t._count.rows })) });
});
