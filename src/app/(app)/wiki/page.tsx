import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { db } from "@/lib/db";
import { UserAvatar } from "@/components/user-avatar";
import { WikiTabs } from "./wiki-tabs";
import { NewWikiPageButton } from "./new-page";
import { WIKI_SECTIONS, WIKI_REVIEW_STALE_DAYS } from "@/lib/wiki-templates";

export const dynamic = "force-dynamic";

const OTHER = "Otras páginas";
const staleMs = WIKI_REVIEW_STALE_DAYS * 86400000;

export default async function WikiPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const pages = await db.wikiPage.findMany({
    where: query
      ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { content: { contains: query, mode: "insensitive" } }, { tags: { has: query.toLowerCase() } }] }
      : undefined,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      _count: { select: { tables: true } },
      owner: { select: { name: true, initials: true, avatarColor: true } },
    },
  });

  // Agrupa por sección (en el orden sugerido; lo demás cae en "Otras páginas").
  const bySection = new Map<string, typeof pages>();
  for (const p of pages) {
    const key = p.section && WIKI_SECTIONS.includes(p.section as never) ? p.section : OTHER;
    (bySection.get(key) ?? bySection.set(key, []).get(key)!).push(p);
  }
  const orderedSections = [...WIKI_SECTIONS.filter((s) => bySection.has(s)), ...(bySection.has(OTHER) ? [OTHER] : [])];
  const now = Date.now();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Wiki del equipo</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Toda la información de la empresa: procesos, equipo, clientes, inventario y contraseñas.
      </p>
      <WikiTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Documentación</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Páginas por sección. Cada una con su dueño y su última revisión.
          </p>
        </div>
        <NewWikiPageButton />
      </div>

      {/* Buscador global de la wiki (título, contenido y etiquetas) */}
      <form className="mt-4 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
        <Search className="size-4 text-muted-foreground" />
        <input name="q" defaultValue={query} placeholder="Buscar en toda la wiki…" className="w-full bg-transparent text-sm outline-none" />
        {query ? <Link href="/wiki" className="text-xs text-muted-foreground hover:text-foreground">Limpiar</Link> : null}
      </form>

      <div className="mt-6 space-y-8">
        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {query ? `Sin resultados para «${query}».` : "Aún no hay páginas. Crea la primera con una plantilla."}
          </p>
        ) : (
          orderedSections.map((section) => (
            <section key={section}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section}</h3>
              <div className="space-y-2">
                {bySection.get(section)!.map((p) => {
                  const reviewedMs = p.lastReviewedAt ? p.lastReviewedAt.getTime() : 0;
                  const stale = now - reviewedMs > staleMs;
                  return (
                    <Link
                      key={p.id}
                      href={`/wiki/${p.id}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                        {p.icon ?? <FileText className="size-4 text-muted-foreground" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {p._count.tables > 0 ? <span>{p._count.tables} tabla{p._count.tables === 1 ? "" : "s"}</span> : null}
                          {p.tags.slice(0, 4).map((t) => (
                            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">#{t}</span>
                          ))}
                        </div>
                      </div>
                      {stale ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Revisar</span>
                      ) : null}
                      {p.owner ? (
                        <span title={`Dueño: ${p.owner.name}`}><UserAvatar initials={p.owner.initials} color={p.owner.avatarColor} size="sm" /></span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
