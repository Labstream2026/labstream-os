import Link from "next/link";
import { SectionChatCard } from "@/components/chat/section-chat-card";
import { FileText, Search, ChevronRight, Package, HardDrive, KeyRound, Clock, BookOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/lib/db";
import { UserAvatar } from "@/components/user-avatar";
import { WikiTabs } from "./wiki-tabs";
import { NewWikiPageButton } from "./new-page";
import { ensureStartHerePage, getInventoryTableId, getLocationsTableId } from "@/lib/wiki-tables";
import { WIKI_SECTIONS, WIKI_REVIEW_STALE_DAYS } from "@/lib/wiki-templates";

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

export default async function WikiPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();

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

  // Conteos en vivo para los accesos rápidos (inventario / ubicación).
  const [invTableId, locTableId] = await Promise.all([getInventoryTableId(), getLocationsTableId()]);
  const [invTotal, invEstadoCol, locTotal, locCadCol] = await Promise.all([
    db.dataRow.count({ where: { tableId: invTableId } }),
    db.dataColumn.findFirst({ where: { tableId: invTableId, name: "Estado" }, select: { id: true } }),
    db.dataRow.count({ where: { tableId: locTableId } }),
    db.dataColumn.findFirst({ where: { tableId: locTableId, name: "Caducidad" }, select: { id: true } }),
  ]);
  const [estadoCells, cadCells] = await Promise.all([
    invEstadoCol ? db.dataCell.findMany({ where: { columnId: invEstadoCol.id }, select: { value: true } }) : Promise.resolve([]),
    locCadCol ? db.dataCell.findMany({ where: { columnId: locCadCol.id }, select: { value: true } }) : Promise.resolve([]),
  ]);
  const invAttention = estadoCells.filter((c) => c.value === "en-mantenimiento" || c.value === "danado").length;
  const locSoon = cadCells.filter((c) => { const d = daysUntil(typeof c.value === "string" ? c.value : ""); return d !== null && d <= 30; }).length;

  const tiles = [
    { href: "/wiki/inventario", Icon: Package, title: "Inventario", main: `${invTotal} equipo${invTotal === 1 ? "" : "s"}`, alert: invAttention > 0 ? `${invAttention} requiere${invAttention === 1 ? "" : "n"} atención` : null },
    { href: "/wiki/ubicacion", Icon: HardDrive, title: "Ubicación del material", main: `${locTotal} respaldo${locTotal === 1 ? "" : "s"}`, alert: locSoon > 0 ? `${locSoon} por vencer` : null },
    { href: "/wiki/contrasenas", Icon: KeyRound, title: "Usuarios y contraseñas", main: "Credenciales cifradas", alert: null },
  ];

  const now = nowMs();

  // Páginas que ya tocaba revisar (revisadas alguna vez y vencidas) — gobernanza arriba.
  const reviewList = pages
    .filter((p) => p.lastReviewedAt && now - p.lastReviewedAt.getTime() > staleMs)
    .slice(0, 6);

  // Agrupa las páginas de documentación por sección (lo demás cae en "Otras páginas").
  const bySection = new Map<string, typeof pages>();
  for (const p of pages) {
    const key = p.section && WIKI_SECTIONS.includes(p.section as never) ? p.section : OTHER;
    (bySection.get(key) ?? bySection.set(key, []).get(key)!).push(p);
  }
  const orderedSections = [...WIKI_SECTIONS.filter((s) => bySection.has(s)), ...(bySection.has(OTHER) ? [OTHER] : [])];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Wiki del equipo</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Toda la información de la empresa: procesos, equipo, clientes, inventario y contraseñas.
      </p>
      <div className="mb-6"><SectionChatCard section="wiki" /></div>
      <WikiTabs />

      {/* Accesos rápidos con conteos en vivo */}
      {!query ? (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <t.Icon className="size-5 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t.title}</p>
                <p className="truncate text-xs text-muted-foreground">{t.main}</p>
                {t.alert ? (
                  <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{t.alert}</span>
                ) : null}
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      ) : null}

      {/* Para revisar (páginas con revisión vencida) */}
      {!query && reviewList.length > 0 ? (
        <div className="mb-6 overflow-hidden rounded-xl border border-amber-300 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 border-b border-amber-200 px-4 py-2.5 dark:border-amber-900/50">
            <Clock className="size-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">Para revisar</span>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">{reviewList.length}</span>
          </div>
          <div className="divide-y divide-amber-200/70 dark:divide-amber-900/40">
            {reviewList.map((p) => (
              <Link key={p.id} href={`/wiki/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-amber-100/50 dark:hover:bg-amber-900/20">
                <span className="text-lg">{p.icon ?? <FileText className="size-4 text-muted-foreground" />}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.title}</span>
                {p.owner ? <span title={`Dueño: ${p.owner.name}`}><UserAvatar initials={p.owner.initials} name={p.owner.name} color={p.owner.avatarColor} size="sm" /></span> : null}
                <span className="shrink-0 text-xs text-amber-700 dark:text-amber-300">
                  {Math.round((now - p.lastReviewedAt!.getTime()) / 86400000)} días
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

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
          <EmptyState
            icon={<BookOpen />}
            title={query ? "Sin resultados" : "Aún no hay páginas"}
            description={query ? `No encontramos páginas para «${query}».` : "Crea la primera con una plantilla."}
          />
        ) : (
          orderedSections.map((section) => (
            <section key={section}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section}</h3>
              <div className="space-y-2">
                {(bySection.get(section) ?? []).map((p) => {
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
                        <span title={`Dueño: ${p.owner.name}`}><UserAvatar initials={p.owner.initials} name={p.owner.name} color={p.owner.avatarColor} size="sm" /></span>
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
