"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { CalItem } from "./my-calendar";
import { calTone, itemSolid, emitCalendarDetail, emitCalendarCreate, personColor, type ColorBy } from "./calendar-detail";
import { moveMyEvent, moveMyTask } from "./actions";
import { bogotaMinutesOfDay } from "@/lib/bogota-time";
import { holidayName } from "@/lib/holidays-co";
import { EntityEmoji, emojiToText } from "@/components/icons/marks";

const HOUR_H = 44; // alto en px de cada hora
const GUTTER = 44; // ancho de la columna de horas (debe coincidir con gridTemplateColumns)
const SNAP = 15; // minutos de imantado al arrastrar
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// Ventana horaria VISIBLE de la rejilla: 04:00–24:00 (se muestran las horas 4..23; la última
// etiqueta es 11 PM). Reduce el ruido de la madrugada y aprovecha mejor el alto disponible. Toda
// posición vertical se calcula con minToTop() (resta el inicio), de modo que las 4:00 quedan arriba
// del todo. La lógica de zona horaria (hora de pared en UTC) NO cambia: solo la ventana de display.
const START_HOUR = 4;
const END_HOUR = 24; // exclusivo: la rejilla llega hasta medianoche
const START_MIN = START_HOUR * 60; // 240
const VISIBLE_HOURS = END_HOUR - START_HOUR; // 20 filas
// Minuto del día → píxeles desde la parte superior de la rejilla (respeta la ventana visible).
function minToTop(min: number): number {
  return ((min - START_MIN) / 60) * HOUR_H;
}

// Sufijo « · <proyecto>» para los TOOLTIPS de los items de tarea/rodaje (contexto de solo
// texto: el emoji del proyecto puede ser un token "ls:<clave>" → se degrada con emojiToText).
function projTip(it: CalItem): string {
  return (it.kind === "task" || it.kind === "shoot") && it.projectName
    ? ` · ${emojiToText(it.projectEmoji, "🗂️")} ${it.projectName}`
    : "";
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
function localDateStr(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // domingo como primer día
  return x;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
// La app guarda las fechas en UTC SIN convertir (el contenedor corre en UTC), de modo que
// los CAMPOS UTC de un evento son su hora de pared (lo que el usuario tecleó). Por eso para
// ubicarlo en la rejilla se leen en UTC; si se usara getHours()/getDate() del navegador, en
// Colombia (UTC-5) el bloque saldría 5 horas antes (un evento de 4:00 p. m. caía a las 11).
function minutesOf(d: Date) {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function evDayKey(d: Date) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}
function colDayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
// ¿El evento (hora de pared en UTC) cae en la columna (fecha local del navegador)?
function evOnDay(ev: Date, col: Date) {
  return evDayKey(ev) === colDayKey(col);
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

type Drag = {
  // Exactamente uno de eventId/taskId: el bloque arrastrado es una cita o una tarea.
  id: string; eventId: string | null; taskId: string | null; mode: "move" | "resize";
  startY: number; origTopMin: number; origDur: number; origDayIndex: number;
  gridLeft: number; colW: number; moved: boolean;
};

// ¿Se puede arrastrar el bloque? Citas: creador o admin/productor (canMoveEvent). Tareas: dueño/
// asignado/gestor (canMoveTask). Las tareas se MUEVEN pero no se redimensionan (no tienen duración).
function isMovable(it: CalItem): boolean {
  return Boolean((it.eventId && (it.canEdit || it.canMoveEvent)) || (it.taskId && it.canMoveTask));
}
type Live = { dayIndex: number; topMin: number; endMin: number; moved: boolean };

export function WeekView({ items, onSelect, canCreate = false, colorBy = "tipo", anchor: anchorProp, onAnchorChange, days: dayCountProp = 7 }: { items: CalItem[]; onSelect?: (it: CalItem | null) => void; canCreate?: boolean; colorBy?: ColorBy; anchor?: Date; onAnchorChange?: (d: Date) => void; days?: number }) {
  // Color efectivo de un bloque: por persona (responsable) o por tipo (fallback).
  const blockColor = (it: CalItem, solid: string) => (colorBy === "persona" ? personColor(it) ?? solid : solid);
  // Nº de columnas: 7 (Semana) o 1 (Día). El calendario "shell" controla la fecha ancla; los
  // calendarios embebidos (proyecto/cliente) la manejan internamente.
  const dayCount = dayCountProp === 1 ? 1 : 7;
  const [internalAnchor, setInternalAnchor] = React.useState(() => new Date());
  const anchor = anchorProp ?? internalAnchor;
  const controlled = Boolean(onAnchorChange);
  const commitAnchor = (d: Date) => { if (onAnchorChange) onAnchorChange(d); else setInternalAnchor(d); };
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const [, startMove] = React.useTransition();

  // Estado de arrastre (mover/redimensionar) y su previsualización flotante.
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [preview, setPreview] = React.useState<Live | null>(null);
  const liveRef = React.useRef<Live | null>(null);
  const suppressClick = React.useRef(false);

  const weekStart = dayCount === 7 ? startOfWeek(anchor) : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = new Date();

  // Auto-scroll a ~7 AM al montar.
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, minToTop(7 * 60) - 8);
  }, []);

  // Selección: marca el bloque y emite el detalle al panel derecho (dock).
  const select = (it: CalItem | null) => { setSelectedId(it?.id ?? null); emitCalendarDetail(it); onSelect?.(it); };
  // Al desmontar (salir del calendario o cambiar de vista), limpia el detalle del dock.
  React.useEffect(() => () => emitCalendarDetail(null), []);

  // Arranca un arrastre (mover el bloque o redimensionar por el borde inferior).
  const beginDrag = (e: React.PointerEvent, p: { it: CalItem; topMin: number; endMin: number }, dayIndex: number, mode: "move" | "resize") => {
    if (e.button !== 0 || !isMovable(p.it) || !gridRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    // Captura el puntero: el arrastre sigue al dedo/cursor aunque salga del bloque (móvil incluido).
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    const rect = gridRef.current.getBoundingClientRect();
    const colW = (rect.width - GUTTER) / dayCount;
    const init: Live = { dayIndex, topMin: p.topMin, endMin: p.endMin, moved: false };
    liveRef.current = init;
    setPreview(init);
    setDrag({ id: p.it.id, eventId: p.it.eventId ?? null, taskId: p.it.taskId ?? null, mode, startY: e.clientY, origTopMin: p.topMin, origDur: p.endMin - p.topMin, origDayIndex: dayIndex, gridLeft: rect.left + GUTTER, colW, moved: false });
  };

  // Mientras hay arrastre: seguir el puntero (snap 15 min) y, al soltar, guardar. Se usan POINTER
  // events (no mouse) para que el arrastre funcione también con el DEDO en móvil/tablet; el
  // bloque lleva touch-action:none para que arrastrarlo no haga scroll de la rejilla.
  React.useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dyMin = Math.round(((e.clientY - drag.startY) / HOUR_H * 60) / SNAP) * SNAP;
      let dayIndex = drag.origDayIndex, topMin = drag.origTopMin, endMin = drag.origTopMin + drag.origDur;
      if (drag.mode === "move") {
        topMin = Math.max(START_MIN, Math.min(1440 - drag.origDur, drag.origTopMin + dyMin));
        endMin = topMin + drag.origDur;
        dayIndex = Math.max(0, Math.min(dayCount - 1, Math.floor((e.clientX - drag.gridLeft) / drag.colW)));
      } else {
        endMin = Math.max(drag.origTopMin + SNAP, Math.min(1440, drag.origTopMin + drag.origDur + dyMin));
      }
      const moved = dyMin !== 0 || dayIndex !== drag.origDayIndex;
      const live: Live = { dayIndex, topMin, endMin, moved };
      liveRef.current = live;
      setPreview(live);
    };
    const onUp = () => {
      const live = liveRef.current;
      const d = drag;
      setDrag(null);
      setPreview(null);
      if (!live || !live.moved) return;
      suppressClick.current = true; // evita que el click posterior re-seleccione
      // Se escribe en UTC (campos UTC = hora de pared) para conservar la convención de la
      // app: así el ISO guardado coincide con lo que muestran el detalle y la rejilla.
      const base = days[live.dayIndex];
      const ns = new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0));
      ns.setUTCMinutes(live.topMin);
      const ne = new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0));
      ne.setUTCMinutes(live.endMin);
      startMove(() => {
        // Cita → mueve inicio+fin (y notifica a los citados). Tarea → reprograma su fecha/hora.
        if (d.eventId) void moveMyEvent(d.eventId, ns.toISOString(), ne.toISOString());
        else if (d.taskId) void moveMyTask(d.taskId, ns.toISOString());
      });
    };
    // pointercancel (p. ej. el navegador toma el gesto para hacer scroll): aborta sin reprogramar.
    const onCancel = () => { setDrag(null); setPreview(null); liveRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [drag, days, startMove]);

  // Clasifica cada item por día: cronometrado (evento con hora) vs todo-el-día (tareas, rodajes, eventos all-day).
  const parsed = items.map((it) => {
    const start = new Date(it.start ?? it.date);
    const end = it.end ? new Date(it.end) : null;
    // Cualquier ítem con hora (allDay=false) se ubica en la rejilla horaria: eventos con hora y
    // ahora también tareas con hora de finalización. Los que son "todo el día" (hitos, rodajes,
    // tareas sin hora) van a la franja superior.
    const timed = !it.allDay && !Number.isNaN(start.getTime());
    return { it, start, end, timed };
  });

  const dragItem = drag ? parsed.find((p) => p.it.id === drag.id)?.it : null;

  const monthLabel = dayCount === 1
    ? new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(anchor)
    : new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(weekStart);
  const shift = (n: number) => { const d = new Date(anchor); d.setDate(d.getDate() + n * dayCount); commitAnchor(d); };

  const hours = Array.from({ length: VISIBLE_HOURS }, (_, i) => i + START_HOUR);

  return (
    <div className="flex h-full flex-col">
      {controlled ? null : (
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <h3 className="text-sm font-semibold capitalize">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button onClick={() => shift(-1)} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">←</button>
          <button onClick={() => commitAnchor(new Date())} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Hoy</button>
          <button onClick={() => shift(1)} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">→</button>
        </div>
      </div>
      )}

      {/* Rejilla a borde completo que llena el alto disponible (estilo Notion).
          En móvil hace scroll HORIZONTAL: con 7 columnas + horas, por debajo de ~680px las
          columnas quedarían ilegibles, así que el ancho mínimo fuerza el scroll lateral y las
          tres rejillas (cabecera, todo-el-día y horas) se desplazan juntas y alineadas. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden border-t border-border/50 bg-card">
        <div className="flex min-h-0 flex-1 flex-col" style={{ minWidth: dayCount === 7 ? 680 : undefined }}>
          {/* Cabecera de días */}
          <div className="grid shrink-0 border-b border-border/50" style={{ gridTemplateColumns: `44px repeat(${dayCount}, minmax(0,1fr))` }}>
            <div />
            {days.map((d) => {
              const isToday = sameDay(d, today);
              const holiday = holidayName(localDateStr(d));
              return (
                <div key={d.toISOString()} title={holiday ? `Festivo en Colombia: ${holiday}` : undefined} className={cn("flex items-center justify-center gap-1.5 px-1 py-2 text-center", holiday && !isToday && "bg-amber-50/70 dark:bg-amber-500/[0.07]", isToday && "bg-rose-50/60 dark:bg-rose-500/[0.06]")}>
                  <span className="text-[11px] uppercase text-muted-foreground">{DAYS[d.getDay()]}</span>
                  <span className={cn("inline-flex size-6 items-center justify-center rounded-md text-xs", isToday ? "bg-rose-500 font-semibold text-white" : holiday ? "font-semibold text-amber-700 dark:text-amber-300" : "font-medium text-foreground")}>{d.getDate()}</span>
                </div>
              );
            })}
          </div>

          {/* Franja "todo el día" (tareas, rodajes, eventos all-day) */}
          <div className="grid shrink-0 border-b border-border/50" style={{ gridTemplateColumns: `44px repeat(${dayCount}, minmax(0,1fr))` }}>
            <div className="flex items-center justify-end pr-1.5 text-[9px] text-muted-foreground">todo el día</div>
            {days.map((d) => {
              const chips = parsed.filter((p) => !p.timed && evOnDay(p.start, d));
              const isToday = sameDay(d, today);
              const holiday = holidayName(localDateStr(d));
              return (
                <div key={d.toISOString()} className={cn("min-h-8 space-y-1 p-1", isToday && "bg-rose-50/40 dark:bg-rose-500/[0.04]")}>
                  {holiday ? (
                    <div className="flex w-full items-center gap-1 truncate rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" title={`Festivo en Colombia: ${holiday}`}>
                      <span className="truncate">🎉 {holiday}</span>
                    </div>
                  ) : null}
                  {chips.map((p) => {
                    return (
                      <button key={p.it.id} onClick={() => select(p.it)}
                        className={cn("flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-white transition-all hover:brightness-105", selectedId === p.it.id ? "ring-2 ring-foreground/70 ring-offset-1" : "")}
                        style={{ background: blockColor(p.it, itemSolid(p.it)) }}
                        title={`${p.it.title}${projTip(p.it)}`}>
                        <span className="truncate">{p.it.kind === "milestone" ? "" : p.it.kind === "shoot" ? "🎬 " : p.it.kind === "task" ? "✅ " : "📅 "}{p.it.title}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Rejilla de horas (scroll, llena el alto disponible) */}
          <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto", drag && "select-none")}>
            <div ref={gridRef} className="relative grid" style={{ gridTemplateColumns: `44px repeat(${dayCount}, minmax(0,1fr))`, height: VISIBLE_HOURS * HOUR_H }}>
              {/* Columna de horas */}
              <div className="relative">
                {hours.map((h, idx) => (
                  <div key={h} style={{ height: HOUR_H }} className="relative">
                    {/* La primera etiqueta (4 AM) va DENTRO de la celda para no cortarse contra el borde superior. */}
                    <span className="absolute right-1.5 text-[10px] text-muted-foreground" style={{ top: idx === 0 ? 1 : -7 }}>{h % 12 === 0 ? 12 : h % 12}{h < 12 ? "AM" : "PM"}</span>
                  </div>
                ))}
              </div>
              {/* Columnas de días */}
              {days.map((d, dayIndex) => {
                const dayTimed = parsed
                  .filter((p) => p.timed && evOnDay(p.start, d))
                  .map((p) => {
                    const topMin = Math.max(START_MIN, Math.min(1439, minutesOf(p.start)));
                    const endMin = p.end ? Math.max(topMin + 20, Math.min(1440, minutesOf(p.end) || topMin + 60)) : topMin + 60;
                    return { it: p.it, topMin, endMin };
                  });
                const positioned = layoutDay(dayTimed);
                const isToday = sameDay(d, today);
                return (
                  <div
                    key={d.toISOString()}
                    onClick={canCreate ? (e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const minutes = Math.max(START_MIN, Math.min(END_HOUR * 60 - 15, START_MIN + (y / HOUR_H) * 60));
                      const hh = Math.floor(minutes / 60);
                      const mm = (Math.round((minutes % 60) / 15) * 15) % 60;
                      emitCalendarCreate(localDateStr(d), `${pad2(hh)}:${pad2(mm)}`);
                    } : undefined}
                    className={cn("relative border-l border-border/40", isToday && "bg-rose-50/30 dark:bg-rose-500/[0.03]", canCreate && "cursor-pointer")}
                  >
                    {hours.map((h) => (<div key={h} style={{ height: HOUR_H }} className="border-b border-border/25" />))}
                    {isToday ? <NowLine /> : null}
                    {positioned.map((p) => {
                      const t = calTone(p.it.kind);
                      const top = minToTop(p.topMin);
                      const height = Math.max(18, ((p.endMin - p.topMin) / 60) * HOUR_H);
                      const tiny = height < 30; // bloques muy cortos: una sola línea
                      const draggable = isMovable(p.it);
                      const canResize = Boolean(p.it.eventId); // solo las citas tienen duración; las tareas se mueven pero no se redimensionan
                      const isDragging = drag?.id === p.it.id;
                      return (
                        <button
                          key={p.it.id}
                          onPointerDown={draggable ? (e) => beginDrag(e, p, dayIndex, "move") : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (suppressClick.current) { suppressClick.current = false; return; }
                            select(p.it);
                          }}
                          className={cn(
                            "group absolute flex flex-col overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight transition-all hover:brightness-105 hover:shadow-md",
                            selectedId === p.it.id ? "ring-2 ring-foreground/70 ring-offset-1" : "",
                            draggable && "cursor-grab active:cursor-grabbing",
                            isDragging && "opacity-40",
                          )}
                          style={{ top, height, left: `calc(${p.left}% + 2px)`, width: `calc(${p.width}% - 4px)`, background: blockColor(p.it, t.solid), color: "#fff", touchAction: draggable ? "none" : undefined }}
                          title={draggable ? (canResize ? `${p.it.title}${projTip(p.it)} · arrastra para mover, tira del borde para cambiar la duración` : `${p.it.title}${projTip(p.it)} · arrastra para reprogramar`) : `${p.it.title}${projTip(p.it)}`}>
                          <span className="truncate font-semibold">{p.it.title}</span>
                          {p.it.time && !tiny ? <span className="truncate text-white/80">{p.it.time}</span> : null}
                          {/* Proyecto de la tarea (discreto): segunda línea solo si el bloque tiene espacio. */}
                          {p.it.kind === "task" && p.it.projectName && !tiny ? (
                            <span className="truncate text-[10px] text-white/75"><EntityEmoji value={p.it.projectEmoji} fallback="🗂️" /> {p.it.projectName}</span>
                          ) : null}
                          {draggable && canResize ? (
                            <span
                              onPointerDown={(e) => beginDrag(e, p, dayIndex, "resize")}
                              className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize rounded-b-md opacity-0 transition-opacity group-hover:opacity-100"
                              style={{ background: "rgba(255,255,255,0.35)", touchAction: "none" }}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {/* Previsualización flotante mientras se arrastra/redimensiona */}
              {drag && preview && dragItem ? (
                (() => {
                  const t = calTone(dragItem.kind);
                  const top = minToTop(preview.topMin);
                  const height = Math.max(18, ((preview.endMin - preview.topMin) / 60) * HOUR_H);
                  return (
                    <div
                      className="pointer-events-none absolute z-30 flex flex-col overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight text-white shadow-lg ring-2 ring-white/70"
                      style={{
                        top, height,
                        left: `calc(${GUTTER}px + ${preview.dayIndex} * ((100% - ${GUTTER}px) / ${dayCount}) + 2px)`,
                        width: `calc((100% - ${GUTTER}px) / ${dayCount} - 4px)`,
                        background: t.solid,
                      }}
                    >
                      <span className="truncate font-semibold">{dragItem.title}</span>
                      <span className="truncate text-white/90">{fmtMin(preview.topMin)}–{fmtMin(preview.endMin)}</span>
                    </div>
                  );
                })()
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {/* El detalle de la selección se muestra en el panel derecho (dock), partido sobre el chat. */}
    </div>
  );
}

function NowLine() {
  // Hora de pared de Bogotá (igual en SSR y cliente, sin importar la zona del navegador):
  // coherente con los eventos, que se ubican por su hora de pared. Antes usaba
  // new Date().getHours() → en el servidor (UTC) la línea salía 5 h adelante (a las 11 PM).
  const [min, setMin] = React.useState(() => bogotaMinutesOfDay());
  React.useEffect(() => {
    const t = setInterval(() => setMin(bogotaMinutesOfDay()), 60000);
    return () => clearInterval(t);
  }, []);
  // Fuera de la ventana visible (madrugada antes de las 4:00) no se pinta la línea.
  if (min < START_MIN || min >= END_HOUR * 60) return null;
  return <div className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-rose-500" style={{ top: minToTop(min) }}><span className="absolute -left-1 -top-1 size-2 rounded-full bg-rose-500" /></div>;
}
