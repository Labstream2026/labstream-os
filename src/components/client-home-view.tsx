"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Play, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";
import { UserAvatar } from "@/components/user-avatar";
import { EntityEmoji } from "@/components/icons/marks";
import type { ClientHomeData, HomeProject, HomePiece, TeTocaItem } from "@/lib/client-home-data";
import type { ClientPhase } from "@/lib/client-portal";

// ── Vista del INICIO del cliente ──
// «¿Cómo va mi proceso?» en un pantallazo: lo que le toca revisar (carrusel con el fotograma real
// de cada pieza), el estado de UN proyecto de un vistazo (cuenta atrás + viaje por fases + estado
// pieza por pieza) y, al pie, próximas fechas y novedades. `readOnly` la reutiliza la VISTA PREVIA
// del equipo (/clientes/[id]/portal): mismo render, sin enlaces activos.

function MaybeLink({
  href,
  readOnly,
  className,
  children,
  title,
}: {
  href: string;
  readOnly: boolean;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  if (readOnly) return <div className={cn(className, "cursor-default")}>{children}</div>;
  return (
    <Link href={href} className={className} title={title}>
      {children}
    </Link>
  );
}

// ── Línea de fases del viaje (Brief → Producción → Revisión → Entrega) ──
function PhaseTrack({ phases }: { phases: ClientPhase[] }) {
  return (
    <div className="flex items-center">
      {phases.map((ph, i) => (
        <div key={ph.key} className={cn("flex items-center", i > 0 && "min-w-3 flex-1")}>
          {i > 0 ? (
            <div className={cn("mx-1.5 h-0.5 flex-1 rounded-full", ph.state === "todo" ? "bg-border" : "bg-emerald-300 dark:bg-emerald-500/50")} />
          ) : null}
          <div className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border-2 text-[11px] font-bold",
                ph.state === "done" && "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
                ph.state === "now" && "border-primary/40 bg-primary text-primary-foreground shadow-[0_0_0_3px] shadow-primary/15",
                ph.state === "todo" && "border-border bg-card text-muted-foreground/50",
              )}
            >
              {ph.state === "done" ? "✓" : ph.state === "now" ? "●" : i + 1}
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold leading-none",
                ph.state === "now" ? "text-primary" : ph.state === "done" ? "text-muted-foreground" : "text-muted-foreground/50",
              )}
            >
              {ph.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Carrusel «Te toca a ti»: cada pieza con su fotograma real ──
const CARD_W = "w-[220px]";

function TeTocaCard({ item, readOnly }: { item: TeTocaItem; readOnly: boolean }) {
  return (
    <MaybeLink
      href={item.href}
      readOnly={readOnly}
      title={item.title}
      className={cn(
        "group relative flex shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        CARD_W,
      )}
    >
      {/* El fotograma. Vertical → 9/16, horizontal → 16/9. Sin portada, un lienzo de cine con el ▶. */}
      <div className={cn("relative overflow-hidden bg-gradient-to-br from-zinc-800 to-zinc-950", item.vertical ? "aspect-[9/16]" : "aspect-video")}>
        {item.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/25">
            {item.kind === "survey" ? <Sparkles className="size-9" /> : <Play className="size-9" />}
          </div>
        )}
        {/* Velo inferior para que el texto y el ▶ se lean sobre cualquier fotograma. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
        {item.kind === "review" ? (
          <span className="absolute left-2.5 top-2.5 grid size-9 place-items-center rounded-full bg-white/90 text-zinc-900 shadow-lg backdrop-blur transition-transform group-hover:scale-110">
            <Play className="size-4 translate-x-0.5 fill-current" />
          </span>
        ) : null}
        {item.due ? (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
            <Clock className="size-2.5" /> {item.due}
          </span>
        ) : null}
      </div>
      {/* Pie: pieza + proyecto + CTA. */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{item.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.project}</p>
        </div>
        <span className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
          {item.cta} <ArrowRight className="size-3.5" />
        </span>
      </div>
    </MaybeLink>
  );
}

function TeTocaCarousel({ items, readOnly }: { items: TeTocaItem[]; readOnly: boolean }) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => scroller.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
          🔥 Te toca a ti · {items.length}
        </h2>
        {items.length > 2 ? (
          <div className="ml-auto hidden gap-1 sm:flex">
            <button type="button" onClick={() => scroll(-1)} aria-label="Anterior" className="grid size-7 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => scroll(1)} aria-label="Siguiente" className="grid size-7 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
      {/* Fila deslizable con snap; los negativos del margin/padding dejan que las tarjetas
          «sangren» hasta el borde sin que la sombra se recorte. */}
      <div ref={scroller} className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, i) => (
          <TeTocaCard key={i} item={item} readOnly={readOnly} />
        ))}
      </div>
    </section>
  );
}

// ── Estado de una pieza (chip de color en el vistazo del proyecto) ──
const PIECE_META: Record<HomePiece["status"], { label: string; dot: string; text: string }> = {
  revision: { label: "Esperando tu revisión", dot: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" },
  cambios: { label: "Aplicando tus cambios", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  produccion: { label: "En producción", dot: "bg-indigo-400", text: "text-muted-foreground" },
  listo: { label: "Aprobado", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
};

const COUNTDOWN_TONE: Record<NonNullable<HomeProject["countdown"]>["tone"], string> = {
  urgente: "text-rose-600 dark:text-rose-400",
  pronto: "text-orange-600 dark:text-orange-400",
  tranqui: "text-emerald-600 dark:text-emerald-400",
};

// ── El vistazo de UN proyecto: cuenta atrás + viaje por fases + estado pieza por pieza ──
function GlanceCard({ p, readOnly }: { p: HomeProject; readOnly: boolean }) {
  const hex = p.color ? tone(p.color).hex : null;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {/* Cabecera con la cuenta atrás como titular */}
      <div className="flex flex-wrap items-start gap-3 border-b border-border p-4 sm:p-5">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-xl text-2xl"
          style={{ background: hex ? `${hex}22` : undefined }}
        >
          <EntityEmoji value={p.emoji} fallback="🎬" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold">{p.name}</h3>
            <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium", p.pill.className)}>{p.pill.label}</span>
          </div>
          {p.countdown ? (
            <p className={cn("mt-1 text-lg font-extrabold tracking-tight", COUNTDOWN_TONE[p.countdown.tone])}>
              {p.countdown.text}
              {p.nextLine ? <span className="ml-2 align-middle text-xs font-medium text-muted-foreground">· {p.nextLine}</span> : null}
            </p>
          ) : p.finished ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" /> Proyecto terminado
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Sin fechas próximas por ahora.</p>
          )}
        </div>
        {p.pct !== null ? (
          <div className="shrink-0 text-right">
            <div className="text-2xl font-extrabold tabular-nums">{p.pct}%</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">aprobado</div>
          </div>
        ) : null}
      </div>

      {/* Viaje por fases */}
      <div className="px-4 pt-4 sm:px-6">
        <PhaseTrack phases={p.phases} />
      </div>

      {/* Estado pieza por pieza: lo que el equipo ya entregó / está preparando */}
      {p.pieces.length ? (
        <div className="p-4 sm:p-5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Tus piezas · {p.pieces.length}</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {p.pieces.map((pc, i) => {
              const m = PIECE_META[pc.status];
              return (
                <li key={i} className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                  <span className={cn("size-2 shrink-0 rounded-full", m.dot)} />
                  <span className="min-w-0 flex-1 truncate text-sm">{pc.name}</span>
                  <span className={cn("shrink-0 text-[11px] font-semibold", m.text)}>{m.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="p-4 text-sm text-muted-foreground sm:p-5">Aún no hay piezas para revisar en este proyecto. Te avisaremos en cuanto haya algo listo.</p>
      )}

      {/* Invitación a explorar */}
      <div className="flex flex-wrap gap-2 border-t border-border p-3 sm:px-5">
        <MaybeLink href={`/mis-entregas/${p.id}`} readOnly={readOnly} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent">
          Ver todas las entregas <ArrowRight className="size-3.5" />
        </MaybeLink>
        <MaybeLink href={`/proyectos/${p.id}`} readOnly={readOnly} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground">
          Abrir el proyecto
        </MaybeLink>
      </div>
    </div>
  );
}

export function ClientHomeView({ data, readOnly = false }: { data: ClientHomeData; readOnly?: boolean }) {
  const [sel, setSel] = React.useState(0);
  const projects = data.projects;
  const active = projects[Math.min(sel, projects.length - 1)] ?? null;

  return (
    <div className="space-y-6">
      {/* Lo accionable, arriba: carrusel con el fotograma de cada pieza. Vacío = «al día». */}
      {data.teToca.length ? (
        <TeTocaCarousel items={data.teToca} readOnly={readOnly} />
      ) : (
        <section className="flex items-center gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/[0.06] dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0" /> Estás al día: no hay nada pendiente de tu lado.
        </section>
      )}

      {/* El vistazo del proyecto (con selector si hay varios) */}
      {active ? (
        <section>
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tu proyecto</h2>
            {projects.length > 1 ? (
              <div className="ml-auto flex max-w-full gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {projects.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSel(i)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                      i === (sel < projects.length ? sel : 0)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <GlanceCard p={active} readOnly={readOnly} />
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Aún no tienes proyectos. Cuando el equipo te agregue a uno, lo verás aquí.
        </div>
      )}

      {/* Al pie, compacto: próximas fechas + novedades */}
      <div className="grid gap-5 sm:grid-cols-2">
        <section>
          <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="size-3.5" /> Próximas fechas
          </h2>
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
            {data.fechas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin fechas próximas en tus proyectos.</p>
            ) : (
              <ul className="space-y-2">
                {data.fechas.map((f, i) => (
                  <li key={i} className="flex items-baseline gap-2.5 text-sm">
                    <span className="shrink-0 text-xs font-bold text-primary">{f.when}</span>
                    <span className="min-w-0 flex-1 truncate">{f.label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="size-3.5" /> Novedades
          </h2>
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
            {data.novedades.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aquí verás lo último que pase en tus proyectos.</p>
            ) : (
              <ul className="space-y-2.5">
                {data.novedades.map((n) => {
                  const row = (
                    <span className="flex items-start gap-2.5">
                      {n.actor ? (
                        <UserAvatar initials={n.actor.initials} color={n.actor.color} size="sm" />
                      ) : (
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px]">·</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] leading-snug">{n.title}</span>
                        <span className="block text-[11px] text-muted-foreground">{n.when}</span>
                      </span>
                    </span>
                  );
                  return (
                    <li key={n.id}>
                      {n.link && !readOnly ? (
                        <Link href={n.link} className="block rounded-md transition-colors hover:bg-muted/50">
                          {row}
                        </Link>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
