import Link from "next/link";
import { SectionChatCard } from "@/components/chat/section-chat-card";
import { FileText, Search, Table2 } from "lucide-react";
import { IconWiki } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/lib/db";
import { UserAvatar } from "@/components/user-avatar";
import { WikiTabs } from "./wiki-tabs";
import { NewWikiPageButton } from "./new-page";
import { ensureStartHerePage, getInventoryTableId, getLocationsTableId } from "@/lib/wiki-tables";
import { WIKI_SECTIONS, WIKI_REVIEW_STALE_DAYS } from "@/lib/wiki-templates";
import { plainExcerpt, searchSnippet } from "@/lib/markdown";

export const dynamic = "force-dynamic";

const OTHER = "Otras páginas";
const staleMs = WIKI_REVIEW_STALE_DAYS * 86400000;

// `Date.now()` directo en el cuerpo del componente lo marca la regla de pureza; el wrapper
// a nivel de módulo es equivalente y evita el falso positivo (igual que `new Date()` en helpers).
function nowMs(): number {
  return Date.now();
}

// Días desde hoy hasta "YYYY-MM-DD" (negativo = vencido); null si no hay fecha.
function daysUntil(date: string): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

// Antigüedad en palabras ("hace 3 días", "hace 7 meses"). Se calcula en el SERVIDOR y solo
// se imprime como texto: al ser un componente de servidor no hay hidratación que desajustar.
function antiguedad(from: Date, now: number): string {
  const d = Math.max(0, Math.round((now - from.getTime()) / 86400000));
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  const m = Math.round(d / 30);
  if (m < 12) return `hace ${m} ${m === 1 ? "mes" : "meses"}`;
  const y = Math.floor(d / 365);
  return `hace ${y} ${y === 1 ? "año" : "años"}`;
}

// Estado de salud de UNA página: es lo que se lee de un vistazo en su ficha.
type Salud = "al-dia" | "revisar" | "sin-duenno";

export default async function WikiPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q, f } = await searchParams;
  const query = (q ?? "").trim();
  const filtro = f === "revisar" || f === "sin-duenno" ? f : null;

  // Siembra la página índice "Empieza aquí" la primera vez (idempotente).
  await ensureStartHerePage();

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

  // Alertas vivas de las herramientas: viajan como chips en sus pestañas (antes eran tres
  // tarjetas que repetían lo que ya dicen las pestañas y empujaban la documentación hacia abajo).
  const [invTableId, locTableId] = await Promise.all([getInventoryTableId(), getLocationsTableId()]);
  const [invEstadoCol, locCadCol] = await Promise.all([
    db.dataColumn.findFirst({ where: { tableId: invTableId, name: "Estado" }, select: { id: true } }),
    db.dataColumn.findFirst({ where: { tableId: locTableId, name: "Caducidad" }, select: { id: true } }),
  ]);
  const [estadoCells, cadCells] = await Promise.all([
    invEstadoCol ? db.dataCell.findMany({ where: { columnId: invEstadoCol.id }, select: { value: true } }) : Promise.resolve([]),
    locCadCol ? db.dataCell.findMany({ where: { columnId: locCadCol.id }, select: { value: true } }) : Promise.resolve([]),
  ]);
  const invAttention = estadoCells.filter((c) => c.value === "en-mantenimiento" || c.value === "danado").length;
  const locSoon = cadCells.filter((c) => { const d = daysUntil(typeof c.value === "string" ? c.value : ""); return d !== null && d <= 30; }).length;

  const now = nowMs();

  const saludDe = (p: (typeof pages)[number]): Salud => {
    if (!p.ownerId) return "sin-duenno";
    const reviewed = p.lastReviewedAt ? p.lastReviewedAt.getTime() : 0;
    return now - reviewed > staleMs ? "revisar" : "al-dia";
  };

  // Resumen de salud sobre TODAS las páginas (no sobre el resultado filtrado): así el
  // panorama no cambia según lo que estés mirando.
  const todas = query ? await db.wikiPage.findMany({ select: { ownerId: true, lastReviewedAt: true } }) : pages;
  const total = todas.length;
  const nRevisar = todas.filter((p) => p.ownerId && now - (p.lastReviewedAt?.getTime() ?? 0) > staleMs).length;
  const nSinDuenno = todas.filter((p) => !p.ownerId).length;
  const nAlDia = total - nRevisar - nSinDuenno;

  const visibles = filtro ? pages.filter((p) => saludDe(p) === filtro) : pages;

  // Agrupa las páginas de documentación por sección (lo demás cae en "Otras páginas").
  const bySection = new Map<string, typeof pages>();
  for (const p of visibles) {
    const key = p.section && WIKI_SECTIONS.includes(p.section as never) ? p.section : OTHER;
    (bySection.get(key) ?? bySection.set(key, []).get(key)!).push(p);
  }
  const orderedSections = [...WIKI_SECTIONS.filter((s) => bySection.has(s)), ...(bySection.has(OTHER) ? [OTHER] : [])];

  // Un stat del resumen: los que filtran son enlaces; el resto, texto.
  const stats: { k: string; v: number; tone: "ink" | "good" | "warn"; f: Salud | null }[] = [
    { k: "Páginas", v: total, tone: "ink", f: null },
    { k: "Al día", v: nAlDia, tone: "good", f: null },
    { k: "Para revisar", v: nRevisar, tone: "warn", f: "revisar" },
    { k: "Sin dueño", v: nSinDuenno, tone: "warn", f: "sin-duenno" },
  ];
  const toneClass = { ink: "", good: "text-emerald-600 dark:text-emerald-400", warn: "text-amber-600 dark:text-amber-400" };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Wiki del equipo</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Cómo trabajamos, qué tenemos y dónde está todo.
      </p>
      <div className="mb-6"><SectionChatCard section="wiki" /></div>
      <WikiTabs alertInventario={invAttention} alertMaterial={locSoon} />

      {/* Buscador global de la wiki (título, contenido y etiquetas) */}
      <form className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input name="q" defaultValue={query} placeholder="Buscar en toda la wiki…" className="w-full bg-transparent text-sm outline-none" />
        {query ? <Link href="/wiki" className="shrink-0 text-xs text-muted-foreground hover:text-foreground">Limpiar</Link> : null}
      </form>

      {/* Salud de la documentación: el panorama antes del detalle. «Para revisar» y
          «Sin dueño» son filtros — el número deja de ser un dato y pasa a ser una acción. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => {
          const activo = filtro === s.f && s.f !== null;
          const inner = (
            <>
              {/* nowrap: «Para revisar» se partía en dos líneas y desalineaba los números. */}
              <p className="truncate whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{s.k}</p>
              <p className={`mt-0.5 text-2xl font-bold tabular-nums tracking-tight ${s.v > 0 ? toneClass[s.tone] : "text-muted-foreground"}`}>{s.v}</p>
            </>
          );
          return s.f && s.v > 0 ? (
            <Link
              key={s.k}
              href={activo ? "/wiki" : `/wiki?f=${s.f}`}
              className={`rounded-xl border bg-card px-4 py-3 transition-colors ${activo ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/40"}`}
            >
              {inner}
              <p className="mt-1 text-[11px] text-primary">{activo ? "Quitar filtro" : "Ver solo estas"}</p>
            </Link>
          ) : (
            <div key={s.k} className="rounded-xl border border-border bg-card px-4 py-3">{inner}</div>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {filtro === "revisar" ? "Páginas para revisar" : filtro === "sin-duenno" ? "Páginas sin dueño" : "Documentación"}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {query
              ? `${visibles.length} resultado${visibles.length === 1 ? "" : "s"} para «${query}».`
              : filtro
                ? "Nadie responde por ellas o llevan demasiado sin revisarse."
                : "Páginas por sección. Cada una con su dueño y su última revisión."}
          </p>
        </div>
        <NewWikiPageButton />
      </div>

      <div className="mt-5 space-y-8">
        {visibles.length === 0 ? (
          <EmptyState
            icon={<IconWiki />}
            title={query ? "Sin resultados" : filtro ? "Nada pendiente por aquí" : "Aún no hay páginas"}
            description={
              query ? `No encontramos páginas para «${query}».`
                : filtro ? "Toda la documentación tiene dueño y revisión al día."
                  : "Crea la primera con una plantilla."
            }
          />
        ) : (
          orderedSections.map((section) => (
            <section key={section}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section} · {(bySection.get(section) ?? []).length}
              </h3>
              <div className="space-y-2">
                {(bySection.get(section) ?? []).map((p) => {
                  const salud = saludDe(p);
                  const extracto = plainExcerpt(p.content, 150);
                  return (
                    <Link
                      key={p.id}
                      href={`/wiki/${p.id}`}
                      className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                    >
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                        {p.icon ?? <FileText className="size-4 text-muted-foreground" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold">{p.title}</p>
                          {salud === "revisar" ? (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Revisar</span>
                          ) : salud === "sin-duenno" ? (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Sin dueño</span>
                          ) : null}
                        </div>
                        {/* Buscando: el trozo del texto DONDE aparece lo buscado, resaltado — así el
                            resultado da la respuesta y no obliga a leer la página entera. Sin
                            búsqueda: el extracto, para saber de qué trata sin abrirla. */}
                        {query ? (
                          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                            {searchSnippet(p.content, query).map((f, i) =>
                              f.marca ? (
                                <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-foreground">{f.texto}</mark>
                              ) : (
                                <span key={i}>{f.texto}</span>
                              ),
                            )}
                          </p>
                        ) : extracto ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{extracto}</p>
                        ) : (
                          <p className="mt-1 text-xs italic text-muted-foreground">Página vacía.</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          {p.owner ? (
                            <span className="flex items-center gap-1.5">
                              <UserAvatar initials={p.owner.initials} name={p.owner.name} color={p.owner.avatarColor} size="sm" />
                              {p.owner.name}
                            </span>
                          ) : null}
                          <span>· {antiguedad(p.updatedAt, now)}</span>
                          {p._count.tables > 0 ? (
                            <span className="flex items-center gap-1"><Table2 className="size-3" /> {p._count.tables}</span>
                          ) : null}
                          {p.tags.slice(0, 4).map((t) => (
                            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px]">#{t}</span>
                          ))}
                        </div>
                      </div>
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
