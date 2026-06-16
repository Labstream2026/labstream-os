import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DataTableView } from "@/components/tables/data-table";
import { createTableForWiki } from "@/app/(app)/tablas/actions";
import { updateWikiPage, deleteWikiPage } from "../actions";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { cellsToMap } from "@/lib/table-cells";
import { GovernanceBar } from "./governance-bar";
import { MarkdownEditor } from "./markdown-editor";
import { WIKI_SECTIONS } from "@/lib/wiki-templates";
import { renderMarkdown } from "@/lib/markdown";
import { Pencil } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WikiPageDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const editing = (await searchParams).edit === "1";
  const [page, team] = await Promise.all([
    db.wikiPage.findUnique({
      where: { id },
      include: {
        lastReviewedBy: { select: { name: true } },
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
        <div className="flex items-center gap-3">
          {editing ? (
            <Link href={`/wiki/${id}`} className="text-xs text-muted-foreground hover:text-foreground">Ver</Link>
          ) : (
            <Link href={`/wiki/${id}?edit=1`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Pencil className="size-3.5" /> Editar</Link>
          )}
          <form action={deleteWikiPage.bind(null, id)}>
            <ConfirmSubmit message="¿Eliminar esta página de la wiki? No se puede deshacer." className="text-xs text-muted-foreground hover:text-destructive">Eliminar página</ConfirmSubmit>
          </form>
        </div>
      </div>

      {/* Gobernanza: dueño + última revisión */}
      <div className="mt-4">
        <GovernanceBar
          pageId={id}
          ownerId={page.ownerId}
          team={team.map((m) => ({ id: m.id, name: m.name }))}
          lastReviewedAt={page.lastReviewedAt ? page.lastReviewedAt.toISOString() : null}
          lastReviewedByName={page.lastReviewedBy?.name ?? null}
        />
      </div>

      {editing ? (
        /* Editor de la página (modo edición) */
        <form action={updateWikiPage.bind(null, id)} className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <input name="icon" defaultValue={page.icon ?? ""} maxLength={4} placeholder="📄" className="w-12 rounded-lg border border-input bg-background px-2 py-2 text-center text-xl outline-none focus:ring-2 focus:ring-ring" />
            <input name="title" defaultValue={page.title} placeholder="Título de la página" className="flex-1 bg-transparent text-3xl font-bold tracking-tight outline-none" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select name="section" defaultValue={page.section ?? ""} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="">— Sección —</option>
              {WIKI_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input name="tags" defaultValue={page.tags.join(", ")} placeholder="Etiquetas (separadas por coma)" className="min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <MarkdownEditor defaultValue={page.content} />
          <div className="flex items-center gap-2">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Guardar cambios</button>
            <Link href={`/wiki/${id}`} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancelar</Link>
          </div>
        </form>
      ) : (
        /* Vista de lectura (Markdown renderizado) */
        <article className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{page.icon ? `${page.icon} ` : ""}{page.title}</h1>
          </div>
          {(page.section || page.tags.length) ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {page.section ? <span className="rounded bg-muted px-1.5 py-0.5">{page.section}</span> : null}
              {page.tags.map((t) => <span key={t} className="rounded bg-muted px-1.5 py-0.5">#{t}</span>)}
            </div>
          ) : null}
          {page.content.trim() ? (
            <div className="mt-4 text-sm text-foreground" dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content) }} />
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Esta página está vacía. <Link href={`/wiki/${id}?edit=1`} className="text-primary hover:underline">Edítala</Link> para añadir contenido.</p>
          )}
        </article>
      )}

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
