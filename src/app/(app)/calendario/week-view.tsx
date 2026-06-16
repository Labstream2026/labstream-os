"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { CalItem } from "./my-calendar";
import { calTone, emitCalendarDetail } from "./calendar-detail";

const HOUR_H = 44; // alto en px de cada hora
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // domingo como primer día
  return x;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function minutesOf(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

type Positioned = { it: CalItem; topMin: number; endMin: number; left: number; width: number };

// Reparte en "carriles" los eventos solapados de un día (algoritmo tipo Google Cal).
function layoutDay(timed: { it: CalItem; topMin: number; endMin: number }[]): Positioned[] {
  const sorted = [...timed].sort((a, b) => a.topMin - b.topMin || a.endMin - b.endMin);
  const out: Positioned[] = [];
  let cluster: { it: CalItem; topMin: number; endMin: number; col: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const cols = Math.max(...cluster.map((c) => c.col)) + 1;
    for (const c of cluster) out.push({ it: c.it, topMin: c.topMin, endMin: c.endMin, left: (c.col / cols) * 100, width: 100 / cols });
    cluster = [];
    clusterEnd = -1;
  };
  for (const ev of sorted) {
    if (cluster.length && ev.topMin >= clusterEnd) flush();
    // primer carril libre
    let col = 0;
    const used = new Set(cluster.filter((c) => c.endMin > ev.topMin).map((c) => c.col));
    while (used.has(col)) col++;
    cluster.push({ ...ev, col });
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  flush();
  return out;
}

export function WeekView({ items, onSelect }: { items: CalItem[]; onSelect?: (it: CalItem | null) => void }) {
  const [anchor, setAnchor] = React.useState(() => new Date());
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = new Date();

  // Auto-scroll a ~7 AM al montar.
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_H - 8;
  }, []);

  // Selección: marca el bloque y emite el detalle al panel derecho (dock).
  const select = (it: CalItem | null) => { setSelectedId(it?.id ?? null); emitCalendarDetail(it); onSelect?.(it); };
  // Al desmontar (salir del calendario o cambiar de vista), limpia el detalle del dock.
  React.useEffect(() => () => emitCalendarDetail(null), []);

  // Clasifica cada item por día: cronometrado (evento con hora) vs todo-el-día (tareas, rodajes, eventos all-day).
  const parsed = items.map((it) => {
    const start = new Date(it.start ?? it.date);
    const end = it.end ? new Date(it.end) : null;
    const timed = it.kind === "event" && !it.allDay && !Number.isNaN(start.getTime());
    return { it, start, end, timed };
  });

  const monthLabel = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(weekStart);
  const shift = (weeks: number) => setAnchor((a) => { const d = new Date(a); d.setDate(d.getDate() + weeks * 7); return d; });

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <h3 className="text-sm font-semibold capitalize">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">←</button>
          <button onClick={() => setAnchor(new Date())} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Hoy</button>
          <button onClick={() => shift(1)} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">→</button>
        </div>
      </div>

      {/* Rejilla a borde completo que llena el alto disponible (estilo Notion) */}
      <div className="flex min-h-0 flex-1 flex-col border-t border-border/50 bg-card">
          {/* Cabecera de días */}
          <div className="grid shrink-0 border-b border-border/50" style={{ gridTemplateColumns: "44px repeat(7, minmax(0,1fr))" }}>
            <div />
            {days.map((d) => {
              const isToday = sameDay(d, today);
              return (
                <div key={d.toISOString()} className={cn("flex items-center justify-center gap-1.5 px-1 py-2 text-center", isToday && "bg-rose-50/60 dark:bg-rose-500/[0.06]")}>
                  <span className="text-[11px] uppercase text-muted-foreground">{DAYS[d.getDay()]}</span>
                  <span className={cn("inline-flex size-6 items-center justify-center rounded-md text-xs", isToday ? "bg-rose-500 font-semibold text-white" : "font-medium text-foreground")}>{d.getDate()}</span>
                </div>
              );
            })}
          </div>

          {/* Franja "todo el día" (tareas, rodajes, eventos all-day) */}
          <div className="grid shrink-0 border-b border-border/50" style={{ gridTemplateColumns: "44px repeat(7, minmax(0,1fr))" }}>
            <div className="flex items-center justify-end pr-1.5 text-[9px] text-muted-foreground">todo el día</div>
            {days.map((d) => {
              const chips = parsed.filter((p) => !p.timed && sameDay(p.start, d));
              const isToday = sameDay(d, today);
              return (
                <div key={d.toISOString()} className={cn("min-h-8 space-y-1 p-1", isToday && "bg-rose-50/40 dark:bg-rose-500/[0.04]")}>
                  {chips.map((p) => {
                    const t = calTone(p.it.kind, p.it.kind === "shoot");
                    return (
                      <button key={p.it.id} onClick={() => select(p.it)}
                        className={cn("flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-white transition-all hover:brightness-105", selectedId === p.it.id ? "ring-2 ring-foreground/70 ring-offset-1" : "")}
                        style={{ background: t.solid }}
                        title={p.it.title}>
                        <span className="truncate">{p.it.kind === "shoot" ? "🎬" : p.it.kind === "task" ? "✅" : "📅"} {p.it.title}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Rejilla de horas (scroll, llena el alto disponible) */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: "44px repeat(7, minmax(0,1fr))", height: 24 * HOUR_H }}>
              {/* Columna de horas */}
              <div className="relative">
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR_H }} className="relative">
                    {h > 0 ? <span className="absolute -top-2 right-1.5 text-[10px] text-muted-foreground">{h % 12 === 0 ? 12 : h % 12}{h < 12 ? "AM" : "PM"}</span> : null}
                  </div>
                ))}
              </div>
              {/* Columnas de días */}
              {days.map((d) => {
                const dayTimed = parsed
                  .filter((p) => p.timed && sameDay(p.start, d))
                  .map((p) => {
                    const topMin = Math.max(0, Math.min(1439, minutesOf(p.start)));
                    const endMin = p.end ? Math.max(topMin + 20, Math.min(1440, minutesOf(p.end) || topMin + 60)) : topMin + 60;
                    return { it: p.it, topMin, endMin };
                  });
                const positioned = layoutDay(dayTimed);
                const isToday = sameDay(d, today);
                return (
                  <div key={d.toISOString()} className={cn("relative border-l border-border/40", isToday && "bg-rose-50/30 dark:bg-rose-500/[0.03]")}>
                    {hours.map((h) => (<div key={h} style={{ height: HOUR_H }} className="border-b border-border/25" />))}
                    {isToday ? <NowLine /> : null}
                    {positioned.map((p) => {
                      const t = calTone(p.it.kind);
                      const top = (p.topMin / 60) * HOUR_H;
                      const height = Math.max(18, ((p.endMin - p.topMin) / 60) * HOUR_H);
                      const tiny = height < 30; // bloques muy cortos: una sola línea
                      return (
                        <button key={p.it.id} onClick={() => select(p.it)}
                          className={cn("absolute flex flex-col overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight transition-all hover:brightness-105 hover:shadow-md", selectedId === p.it.id ? "ring-2 ring-foreground/70 ring-offset-1" : "")}
                          style={{ top, height, left: `calc(${p.left}% + 2px)`, width: `calc(${p.width}% - 4px)`, background: t.solid, color: "#fff" }}
                          title={p.it.title}>
                          <span className="truncate font-semibold">{p.it.title}</span>
                          {p.it.time && !tiny ? <span className="truncate text-white/80">{p.it.time}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
      </div>
      {/* El detalle de la selección se muestra en el panel derecho (dock), partido sobre el chat. */}
    </div>
  );
}

function NowLine() {
  const [min, setMin] = React.useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  React.useEffect(() => {
    const t = setInterval(() => setMin(new Date().getHours() * 60 + new Date().getMinutes()), 60000);
    return () => clearInterval(t);
  }, []);
  return <div className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-rose-500" style={{ top: (min / 60) * HOUR_H }}><span className="absolute -left-1 -top-1 size-2 rounded-full bg-rose-500" /></div>;
}
