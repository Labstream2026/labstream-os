import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canAccessProject } from "@/lib/project-access";
import { canSeeWiki } from "@/lib/wiki-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/tables/:id — detalle: columnas y filas con sus valores. Acceso: tabla de proyecto →
// acceso al proyecto; tabla de wiki/sistema → ver_wiki. Las columnas PASSWORD se ocultan.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const table = await db.dataTable.findUnique({
    where: { id },
    select: {
      id: true, name: true, key: true, projectId: true, wikiPageId: true,
      project: { select: { isPrivate: true, leadId: true, archivedAt: true, members: { select: { userId: true, role: true } }, client: { select: { members: { select: { userId: true, role: true } } } } } },
      columns: { orderBy: { position: "asc" }, select: { id: true, name: true, type: true } },
      rows: { orderBy: { position: "asc" }, select: { id: true, cells: { select: { columnId: true, value: true } } } },
    },
  });
  if (!table) return apiJson({ ok: false, error: "Tabla no encontrada." }, 404);
  const allowed = table.project ? !table.project.archivedAt && canAccessProject(table.project, ctx.session) : await canSeeWiki(ctx.session);
  if (!allowed) return apiJson({ ok: false, error: "Sin acceso a esta tabla." }, 403);
  const cols = table.columns.filter((c) => c.type !== "PASSWORD");
  const colName = new Map(cols.map((c) => [c.id, c.name]));
  return apiJson({
    ok: true,
    table: {
      id: table.id, name: table.name, key: table.key, projectId: table.projectId, wikiPageId: table.wikiPageId,
      columns: cols.map((c) => ({ name: c.name, type: c.type })),
      rows: table.rows.map((r) => {
        const values: Record<string, unknown> = {};
        for (const cell of r.cells) { const n = colName.get(cell.columnId); if (n) values[n] = cell.value; }
        return { rowId: r.id, values };
      }),
    },
  });
});
