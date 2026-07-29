import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DataTableView } from "@/components/tables/data-table";
import { createTableForWiki } from "@/app/(app)/tablas/actions";
import { updateWikiPage, deleteWikiPage } from "../actions";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { EmojiSelect } from "@/components/emoji-select";
import { cellsToMap } from "@/lib/table-cells";
import { GovernanceBar } from "./governance-bar";
import { MarkdownEditor } from "./markdown-editor";
import { WIKI_SECTIONS } from "@/lib/wiki-templates";
import { renderMarkdown, extractWikiAttachments, extractHeadings } from "@/lib/markdown";
import { wikiBreadcrumb, wikiDescendants } from "@/lib/wiki-tree";
import { WikiToc } from "./toc";
import { Pencil, Paperclip, ChevronRight } from "lucide-react";

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

  // Migas de pan y candidatas a página madre. Se leen todas las páginas (solo id/título/
  // madre: es una consulta barata) porque ambas cosas necesitan la jerarquía completa.
  const todas = await db.wikiPage.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true, icon: true, section: true, parentId: true, updatedAt: true },
  });
  const ruta = wikiBreadcrumb(todas, id);
  const prohibidas = wikiDescendants(todas, id); // no puede colgar de sí misma ni de una hija
  const headings = extractHeadings(page.content);

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-3">
        {/* Migas: la página deja de ser una isla — se ve de dónde cuelga y se sube de nivel. */}
        <nav aria-label="Ruta" className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <Link href="/wiki" className="shrink-0 hover:text-foreground">Wiki</Link>
          {ruta.slice(0, -1).map((r) => (
            <span key={r.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3 shrink-0" />
              <Link href={`/wiki/${r.id}`} className="truncate hover:text-foreground">{r.title}</Link>
            </span>
          ))}
          {ruta.length > 0 ? (
            <span className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3 shrink-0" />
              <span className="truncate text-foreground">{page.title}</span>
            </span>
          ) : null}
        </nav>
        <div className="flex shrink-0 items-center gap-3">
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
            <EmojiSelect name="icon" defaultValue={page.icon} fallback="📄" />
            <input name="title" defaultValue={page.title} placeholder="Título de la página" className="flex-1 bg-transparent text-3xl font-bold tracking-tight outline-none" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select name="section" defaultValue={page.section ?? ""} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="">— Sección —</option>
              {WIKI_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input name="tags" defaultValue={page.tags.join(", ")} placeholder="Etiquetas (separadas por coma)" className="min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          {/* Página madre: es lo que coloca la página en el árbol. No se ofrecen ni ella
              misma ni sus descendientes — eso crearía un ciclo y la sacaría del árbol. */}
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Cuelga de:</span>
            <select name="parentId" defaultValue={page.parentId ?? ""} className="min-w-56 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="">— Nada (va directo a su sección) —</option>
              {todas.filter((t) => !prohibidas.has(t.id)).map((t) => (
                <option key={t.id} value={t.id}>{t.icon ? `${t.icon} ` : ""}{t.title}</option>
              ))}
            </select>
          </label>
          <MarkdownEditor defaultValue={page.content} />
          <div className="flex items-center gap-2">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Guardar cambios</button>
            <Link href={`/wiki/${id}`} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancelar</Link>
          </div>
        </form>
      ) : (
        /* Vista de lectura (Markdown renderizado) */
        <article className="mt-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{page.icon ? `${page.icon} ` : ""}{page.title}</h1>
          </div>
          {(page.section || page.tags.length) ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {page.section ? <span className="rounded bg-muted px-1.5 py-0.5">{page.section}</span> : null}
              {page.tags.map((t) => <span key={t} className="rounded bg-muted px-1.5 py-0.5">#{t}</span>)}
            </div>
          ) : null}
          {page.content.trim() ? (
            /* `wiki-prose`: ancho de lectura cómodo y aire entre bloques (ver globals.css).
               El HTML lo produce renderMarkdown, que escapa todo lo que venga del usuario. */
            <div className="wiki-prose mt-5 text-[15px] leading-relaxed text-foreground" dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content, { headingIds: true }) }} />
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Esta página está vacía. <Link href={`/wiki/${id}?edit=1`} className="text-primary hover:underline">Edítala</Link> para añadir contenido.</p>
          )}

          {(() => {
            const atts = extractWikiAttachments(page.content);
            if (!atts.length) return null;
            return (
              <div className="mt-6 border-t border-border pt-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Paperclip className="size-3.5" /> Adjuntos ({atts.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {atts.map((a) => (
                    <a key={a.url} href={a.url} target="_blank" rel="noreferrer" title={a.name} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:border-primary/40">
                      {a.isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.url} alt="" className="size-8 rounded object-cover" />
                      ) : (
                        <span className="grid size-8 place-items-center rounded bg-muted">📎</span>
                      )}
                      <span className="max-w-40 truncate">{a.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}
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

      {/* Índice de la página. Solo en pantallas anchas y solo en lectura: durante la
          edición el contenido cambia a cada tecla y un índice a medias estorba. */}
      {!editing && headings.length > 1 ? (
        <aside className="hidden w-44 shrink-0 xl:block">
          <div className="sticky top-6">
            <WikiToc headings={headings} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}
