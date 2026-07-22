import type * as React from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";
import { UserAvatar } from "@/components/user-avatar";
import { EntityEmoji } from "@/components/icons/marks";
import type { ClientHomeData, HomeProject, TeTocaItem } from "@/lib/client-home-data";
import type { ClientPhase } from "@/lib/client-portal";

// ── Vista del INICIO del cliente ──
// «¿Cómo va mi proceso?» en una pantalla: acciones que le tocan, el viaje por fases de cada
// proyecto, próximas fechas y novedades. `readOnly` la reutiliza la VISTA PREVIA del equipo
// (/clientes/[id]/portal): mismo render, sin enlaces activos.

function MaybeLink({
  href,
  readOnly,
  className,
  children,
}: {
  href: string;
  readOnly: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (readOnly) return <div className={cn(className, "cursor-default")}>{children}</div>;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

// Línea de fases del viaje (Brief → Producción → Revisión → Entrega).
function PhaseTrack({ phases }: { phases: ClientPhase[] }) {
  return (
    <div className="flex items-center">
      {phases.map((ph, i) => (
        <div key={ph.key} className={cn("flex items-center", i > 0 && "min-w-3 flex-1")}>
          {i > 0 ? (
            <div className={cn("mx-1 h-0.5 flex-1 rounded-full", ph.state === "todo" ? "bg-border" : "bg-emerald-300 dark:bg-emerald-500/50")} />
          ) : null}
          <div className="flex flex-col items-center gap-1">
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full border-2 text-[10px] font-bold",
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

function TeTocaCard({ item, readOnly }: { item: TeTocaItem; readOnly: boolean }) {
  return (
    <MaybeLink
      href={item.href}
      readOnly={readOnly}
      className="group flex items-center gap-3 rounded-lg border border-orange-200 bg-card px-3.5 py-2.5 transition-colors hover:border-orange-400 dark:border-orange-500/30 dark:hover:border-orange-400/60"
    >
      <span className="text-lg">{item.emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.title}</p>
        <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors group-hover:bg-orange-600">
        {item.cta} <ArrowRight className="size-3.5" />
      </span>
    </MaybeLink>
  );
}

function ProjectCard({ p, readOnly }: { p: HomeProject; readOnly: boolean }) {
  const hex = p.color ? tone(p.color).hex : null;
  return (
    <MaybeLink
      href={`/proyectos/${p.id}`}
      readOnly={readOnly}
      className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-lg"
          style={{ background: hex ? `${hex}22` : undefined }}
        >
          <EntityEmoji value={p.emoji} fallback="🎬" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{p.name}</p>
          {p.nextLine ? (
            <p className="truncate text-xs text-muted-foreground">Siguiente: {p.nextLine}</p>
          ) : p.clientName ? (
            <p className="truncate text-xs text-muted-foreground">{p.clientName}</p>
          ) : null}
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium", p.pill.className)}>{p.pill.label}</span>
      </div>
      <PhaseTrack phases={p.phases} />
      {p.pct !== null ? (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${p.pct}%` }} />
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground">{p.pct}% aprobado</span>
        </div>
      ) : null}
    </MaybeLink>
  );
}

export function ClientHomeView({ data, readOnly = false }: { data: ClientHomeData; readOnly?: boolean }) {
  return (
    <div className="space-y-5">
      {/* Te toca a ti: lo accionable, arriba y en naranja. Vacío = «estás al día». */}
      <section className="rounded-xl border border-orange-200/80 bg-orange-50/60 p-4 dark:border-orange-500/25 dark:bg-orange-500/[0.06]">
        <h2 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400">
          🔥 Te toca a ti {data.teToca.length ? `· ${data.teToca.length}` : ""}
        </h2>
        {data.teToca.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-500" /> Estás al día: no hay nada pendiente de tu lado.
          </p>
        ) : (
          <div className="grid gap-2">
            {data.teToca.map((item, i) => (
              <TeTocaCard key={i} item={item} readOnly={readOnly} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.65fr_1fr]">
        {/* Proyectos con su viaje por fases */}
        <section>
          <h2 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Tus proyectos {data.projects.length ? `· ${data.projects.length}` : ""}
          </h2>
          {data.projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Aún no tienes proyectos. Cuando el equipo te agregue a uno (o crees el tuyo), lo verás aquí.
            </div>
          ) : (
            <div className="grid gap-3">
              {data.projects.map((p) => (
                <ProjectCard key={p.id} p={p} readOnly={readOnly} />
              ))}
            </div>
          )}
        </section>

        {/* Lateral: próximas fechas + novedades */}
        <div className="space-y-5">
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
    </div>
  );
}
