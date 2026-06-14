import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DataTableView } from "@/components/tables/data-table";
import { createTableForWiki } from "@/app/(app)/tablas/actions";
import { updateWikiPage, deleteWikiPage } from "../actions";
import { cellsToMap } from "@/lib/table-cells";

export const dynamic = "force-dynamic";

export default async function WikiPageDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [page, team] = await Promise.all([
    db.wikiPage.findUnique({
      where: { id },
      include: {
        tables: {
          orderBy: { createdAt: "asc" },
          include: {
            columns: { orderBy: { position: "asc" } },
            // Acotamos a 500 filas por tabla para no cargar tablas enormes de golpe.
            rows: { orderBy: { position: "asc" }, take: 500, include: { cells: true } },
            _count: { select: { rows: true } },
          },
        },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } }),
  ]);
  if (!page) notFound();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="flex items-center justify-between">
        <Link href="/wiki" className="text-sm text-muted-foreground hover:text-foreground">← Wiki</Link>
        <form action={deleteWikiPage.bind(null, id)}>
          <button className="text-xs text-muted-foreground hover:text-destructive">Eliminar página</button>
        </form>
      </div>

      {/* Editor de la página */}
      <form action={updateWikiPage.bind(null, id)} className="mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <input name="icon" defaultValue={page.icon ?? ""} maxLength={4} placeholder="📄" className="w-12 rounded-lg border border-input bg-background px-2 py-2 text-center text-xl outline-none focus:ring-2 focus:ring-ring" />
          <input name="title" defaultValue={page.title} placeholder="Título de la página" className="flex-1 bg-transparent text-3xl font-bold tracking-tight outline-none" />
        </div>
        <textarea
          name="content"
          defaultValue={page.content}
          rows={8}
          placeholder="Escribe la documentación aquí… (puedes usar Markdown)"
          className="w-full resize-y rounded-lg border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Guardar cambios
        </button>
      </form>

      {/* Tablas embebidas */}
      <div className="mt-8 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tablas</h2>
          <form action={createTableForWiki.bind(null, id)}>
            <input type="hidden" name="name" value="Tabla" />
            <button className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">+ Tabla</button>
          </form>
        </div>
        {page.tables.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Añade una tabla tipo Notion (estado, fecha, persona, citas de calendario) para estructurar la información.
          </p>
        ) : null}
        {page.tables.map((t) => (
          <div key={t.id}>
            <DataTableView
              team={team.map((m) => ({ id: m.id, name: m.name, initials: m.initials, color: m.avatarColor }))}
              table={{
                id: t.id,
                name: t.name,
                columns: t.columns.map((c) => ({ id: c.id, name: c.name, type: c.type, options: (c.options as { id: string; label: string; color: string }[] | null) ?? null })),
                rows: t.rows.map((r) => ({ id: r.id, cells: cellsToMap(t.columns, r.cells) })),
              }}
            />
            {t._count.rows > t.rows.length ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Mostrando las primeras {t.rows.length} de {t._count.rows} filas.
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
