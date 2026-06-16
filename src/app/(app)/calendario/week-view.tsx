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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold capitalize">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">←</button>
          <button onClick={() => setAnchor(new Date())} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Hoy</button>
          <button onClick={() => shift(1)} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">→</button>
        </div>
      </div>

      <div className="relative">
        {/* Rejilla (ancho completo; el detalle flota encima a la derecha) */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          {/* Cabecera de días */}
          <div className="grid border-b border-border" style={{ gridTemplateColumns: "44px repeat(7, minmax(0,1fr))" }}>
            <div className="border-r border-border" />
            {days.map((d) => {
              const isToday = sameDay(d, today);
              return (
                <div key={d.toISOString()} className="border-r border-border px-1 py-1.5 text-center last:border-r-0">
                  <span className="text-[11px] uppercase text-muted-foreground">{DAYS[d.getDay()]}</span>{" "}
                  <span className={cn("inline-flex size-5 items-center justify-center rounded-full text-xs", isToday ? "bg-primary font-semibold text-primary-foreground" : "font-medium")}>{d.getDate()}</span>
                </div>
              );
            })}
          </div>

          {/* Franja "todo el día" (tareas, rodajes, eventos all-day) */}
          <div className="grid border-b border-border bg-muted/20" style={{ gridTemplateColumns: "44px repeat(7, minmax(0,1fr))" }}>
            <div className="flex items-center justify-end border-r border-border pr-1 text-[9px] text-muted-foreground">todo el día</div>
            {days.map((d) => {
              const chips = parsed.filter((p) => !p.timed && sameDay(p.start, d));
              return (
                <div key={d.toISOString()} className="min-h-7 space-y-0.5 border-r border-border p-0.5 last:border-r-0">
                  {chips.map((p) => {
                    const t = calTone(p.it.kind, p.it.kind === "shoot");
                    return (
                      <button key={p.it.id} onClick={() => select(p.it)}
                        className={cn("flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] font-medium", selectedId === p.it.id && "ring-1 ring-primary")}
                        style={{ background: t.bg, borderLeft: `2px solid ${t.bar}` }}
                        title={p.it.title}>
                        <span className="truncate">{p.it.kind === "shoot" ? "🎬" : p.it.kind === "task" ? "✅" : "📅"} {p.it.title}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Rejilla de horas (scroll) */}
          <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: "44px repeat(7, minmax(0,1fr))", height: 24 * HOUR_H }}>
              {/* Columna de horas */}
              <div className="relative border-r border-border">
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR_H }} className="relative">
                    {h > 0 ? <span className="absolute -top-2 right-1 text-[10px] text-muted-foreground">{h % 12 === 0 ? 12 : h % 12}{h < 12 ? "AM" : "PM"}</span> : null}
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
                  <div key={d.toISOString()} className="relative border-r border-border last:border-r-0">
                    {hours.map((h) => (<div key={h} style={{ height: HOUR_H }} className="border-b border-border/40" />))}
                    {isToday ? <NowLine /> : null}
                    {positioned.map((p) => {
                      const t = calTone(p.it.kind);
                      const top = (p.topMin / 60) * HOUR_H;
                      const height = Math.max(18, ((p.endMin - p.topMin) / 60) * HOUR_H);
                      return (
                        <button key={p.it.id} onClick={() => select(p.it)}
                          className={cn("absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[10px] leading-tight", selectedId === p.it.id && "ring-1 ring-primary")}
                          style={{ top, height, left: `calc(${p.left}% + 1px)`, width: `calc(${p.width}% - 2px)`, background: t.bg, borderLeft: `3px solid ${t.bar}` }}
                          title={p.it.title}>
                          <span className="block truncate font-medium">{p.it.title}</span>
                          {p.it.time ? <span className="block truncate text-muted-foreground">{p.it.time}</span> : null}
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
