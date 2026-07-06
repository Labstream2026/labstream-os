import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canSeeWiki } from "@/lib/wiki-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/inventory — inventario de equipos (tabla sys:inventario): filas con sus valores y el
// rowId que usa POST …/reservations. Solo equipo con ver_wiki (es una tabla de la wiki). Las
// columnas de tipo PASSWORD se ocultan (nunca se vuelca un secreto).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext) => {
  if (!(await canSeeWiki(ctx.session))) return apiJson({ ok: false, error: "Sin acceso al inventario (ver_wiki)." }, 403);
  const table = await db.dataTable.findUnique({
    where: { key: "sys:inventario" },
    select: {
      id: true, name: true,
      columns: { orderBy: { position: "asc" }, select: { id: true, name: true, type: true } },
      rows: { orderBy: { position: "asc" }, select: { id: true, cells: { select: { columnId: true, value: true } } } },
    },
  });
  if (!table) return apiJson({ ok: false, error: "No hay tabla de inventario." }, 404);
  const cols = table.columns.filter((c) => c.type !== "PASSWORD");
  const colName = new Map(cols.map((c) => [c.id, c.name]));
  return apiJson({
    ok: true,
    columns: cols.map((c) => ({ name: c.name, type: c.type })),
    items: table.rows.map((r) => {
      const values: Record<string, unknown> = {};
      for (const cell of r.cells) { const n = colName.get(cell.columnId); if (n) values[n] = cell.value; }
      return { rowId: r.id, values };
    }),
  });
});
