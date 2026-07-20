"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { CalItem } from "./my-calendar";
import { calTone, itemSolid, emitCalendarDetail, emitCalendarCreate, personColor, type ColorBy } from "./calendar-detail";
import { moveMyEvent, moveMyTask } from "./actions";
import { bogotaMinutesOfDay } from "@/lib/bogota-time";
import { holidayName } from "@/lib/holidays-co";
import { EntityEmoji, emojiToText } from "@/components/icons/marks";

const MIN_HOUR_H = 44; // alto MÍNIMO de cada hora (px); crece para llenar el alto disponible
const GUTTER = 44; // ancho de la columna de horas (debe coincidir con gridTemplateColumns)
const SNAP = 15; // minutos de imantado al arrastrar
const DRAG_THRESHOLD = 4; // px que hay que mover para que un "mantener presionado" pase a arrastre
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
// El alto de hora (hourH) es dinámico: crece para llenar el espacio disponible.
function minToTop(min: number, hourH: number): number {
  return ((min - START_MIN) / 60) * hourH;
}

// Cuántos chips "todo el día" se ven por día antes de que el resto quede tras el scroll
// del propio día (un día cargado de entregas ya no estira la franja de toda la semana).
export const MAX_ALLDAY_VISIBLE = 5;
// Orden de agrupación de los chips de un día: citas → rodajes → hitos → tareas; dentro del
// grupo por hora (citas del mes) y por título, de modo que las «Entregar al cliente…» y las
// «Pre-aprobar…» quedan juntas y en orden estable, no según llegaron de la consulta.
const KIND_ORDER: Record<string, number> = { event: 0, shoot: 1, milestone: 2, task: 3 };
export function compareChips(a: CalItem, b: CalItem): number {
  return (
    (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) ||
    (a.time ?? "").localeCompare(b.time ?? "") ||
    a.title.localeCompare(b.title, "es")
  );
}

// Marcador de TIPO dentro de las pastillas de color del calendario (antes emojis ✅/🎬/📅):
// glifos blancos mínimos que heredan el color del texto de la pastilla.
export function KindGlyph({ kind }: { kind: CalItem["kind"] }) {
  if (kind === "milestone") return null;
  const d = kind === "shoot"
    ? "M3 8.5c0-1 .8-1.8 1.8-1.8h9.4c1 0 1.8.8 1.8 1.8v7c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8v-7Zm13 2.6 5-2.3v6.4l-5-2.3" // videocámara
    : kind === "task"
      ? "M5 12.5l4.5 4.5L19 7.5" // check
      : "M6 4v3M18 4v3M4 8.5h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"; // calendario
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="size-3 shrink-0" aria-hidden>
      <path d={d} />
    </svg>
  );
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
  startY: number; startX: number; origTopMin: number; origDur: number; origDayIndex: number;
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

  // Alto de cada hora en px: crece para LLENAR el alto visible (sin zona muerta abajo) y nunca
  // baja de MIN_HOUR_H (por debajo de eso, la rejilla hace scroll). Se mide con ResizeObserver.
  const [hourH, setHourH] = React.useState(MIN_HOUR_H);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setHourH(Math.max(MIN_HOUR_H, Math.floor(h / VISIBLE_HOURS)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Estado de arrastre (mover/redimensionar) y su previsualización flotante.
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [preview, setPreview] = React.useState<Live | null>(null);
  const liveRef = React.useRef<Live | null>(null);
  const suppressClick = React.useRef(false);
  // "Mantener presionado" pendiente: se registra al apoyar el puntero pero NO inicia el arrastre
  // hasta cruzar DRAG_THRESHOLD. Así un clic simple o doble clic NO se convierten en arrastre y
  // el navegador dispara click/dblclick de forma nativa (no hacemos preventDefault en pointerdown).
  const pendingRef = React.useRef<Drag | null>(null);

  const weekStart = dayCount === 7 ? startOfWeek(anchor) : new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const days = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = new Date();

  // Un clic: solo RESALTA el bloque (no abre nada). Doble clic / doble toque: abre el detalle
  // (estatus) en el panel derecho. La edición se hace desde ese detalle (botón Editar).
  const highlight = (it: CalItem | null) => { setSelectedId(it?.id ?? null); onSelect?.(it); };
  const openDetail = (it: CalItem) => { setSelectedId(it.id); emitCalendarDetail(it); onSelect?.(it); };
  // Al desmontar (salir del calendario o cambiar de vista), limpia el detalle del dock.
  React.useEffect(() => () => emitCalendarDetail(null), []);

  // Descriptor de arrastre a partir de un bloque (aún NO lo activa).
  const buildDrag = (e: React.PointerEvent, p: { it: CalItem; topMin: number; endMin: number }, dayIndex: number, mode: "move" | "resize"): Drag | null => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    const colW = (rect.width - GUTTER) / dayCount;
    // Contenedor degenerado (más angosto que la propia columna de horas): no arrastrar, o el
    // cálculo de columna daría NaN/Infinity y days[NaN] rompería onUp.
    if (!(colW > 0)) return null;
    return { id: p.it.id, eventId: p.it.eventId ?? null, taskId: p.it.taskId ?? null, mode, startY: e.clientY, startX: e.clientX, origTopMin: p.topMin, origDur: p.endMin - p.topMin, origDayIndex: dayIndex, gridLeft: rect.left + GUTTER, colW, moved: false };
  };
  // Activa el arrastre YA (muestra la previsualización flotante).
  const activateDrag = (d: Drag) => {
    const init: Live = { dayIndex: d.origDayIndex, topMin: d.origTopMin, endMin: d.origTopMin + d.origDur, moved: false };
    liveRef.current = init;
    setPreview(init);
    setDrag(d);
  };
  // "Mantener presionado" sobre un bloque: registra el press pendiente pero NO arranca el arrastre
  // (sin preventDefault) → el navegador dispara click/dblclick de forma nativa. El arrastre real se
  // activa cuando el puntero se mueve más de DRAG_THRESHOLD (efecto de abajo).
  const armMove = (e: React.PointerEvent, p: { it: CalItem; topMin: number; endMin: number }, dayIndex: number) => {
    if (e.button !== 0 || !isMovable(p.it)) return;
    pendingRef.current = buildDrag(e, p, dayIndex, "move");
  };
  // Redimensionar por el borde inferior: gesto deliberado → arranca de inmediato.
  const startResize = (e: React.PointerEvent, p: { it: CalItem; topMin: number; endMin: number }, dayIndex: number) => {
    if (e.button !== 0 || !isMovable(p.it)) return;
    e.preventDefault();
    e.stopPropagation();
    const d = buildDrag(e, p, dayIndex, "resize");
    if (d) activateDrag(d);
  };

  // Promoción del "mantener presionado" a arrastre al cruzar el umbral (evita convertir un clic o
  // un doble clic en un movimiento accidental de la cita).
  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pend = pendingRef.current;
      if (!pend || drag) return;
      if (Math.abs(e.clientX - pend.startX) + Math.abs(e.clientY - pend.startY) > DRAG_THRESHOLD) {
        pendingRef.current = null;
        activateDrag(pend);
      }
    };
    const clear = () => { pendingRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
    };
  }, [drag]);

  // Mientras hay arrastre: seguir el puntero (snap 15 min) y, al soltar, guardar. Se usan POINTER
  // events (no mouse) para que el arrastre funcione también con el DEDO en móvil/tablet; el
  // bloque lleva touch-action:none para que arrastrarlo no haga scroll de la rejilla.
  React.useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dyMin = Math.round(((e.clientY - drag.startY) / hourH * 60) / SNAP) * SNAP;
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
      suppressClick.current = true; // evita que el click posterior (bloque o columna) actúe
      // Red de seguridad: si tras el arrastre NO llega ningún click sintético (p. ej. algunos
      // gestos táctiles), limpia el flag para no tragarse el siguiente click real.
      setTimeout(() => { suppressClick.current = false; }, 0);
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
  }, [drag, days, startMove, hourH, dayCount]);

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

  // Auto-scroll UNA sola vez (tras medir el alto): a la PRIMERA hora con actividad de los días
  // visibles (con ~45 min de aire arriba), o a las 7 AM si no hay nada cronometrado. Si la
  // rejilla llena el alto visible no hay scroll y queda en 0.
  const timedStarts = parsed.filter((p) => p.timed && days.some((d) => evOnDay(p.start, d))).map((p) => minutesOf(p.start));
  const focusMin = timedStarts.length ? Math.max(START_MIN, Math.min(...timedStarts) - 45) : 7 * 60;
  const didAutoScroll = React.useRef(false);
  React.useEffect(() => {
    if (didAutoScroll.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = Math.max(0, minToTop(focusMin, hourH) - 8);
    didAutoScroll.current = true;
  }, [hourH, focusMin]);

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
      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden rounded-xl border border-border bg-card">
        <div className="flex min-h-0 flex-1 flex-col" style={{ minWidth: dayCount === 7 ? 680 : undefined }}>
          {/* Cabecera de días */}
          <div className="grid shrink-0 border-b border-border" style={{ gridTemplateColumns: `44px repeat(${dayCount}, minmax(0,1fr))` }}>
            <div />
            {days.map((d) => {
              const isToday = sameDay(d, today);
              const holiday = holidayName(localDateStr(d));
              const wknd = dayCount === 7 && (d.getDay() === 0 || d.getDay() === 6);
              return (
                <div key={d.toISOString()} title={holiday ? `Festivo en Colombia: ${holiday}` : undefined} className={cn("flex items-center justify-center gap-1.5 px-1 py-2 text-center", wknd && !isToday && !holiday && "bg-muted/40", holiday && !isToday && "bg-amber-50/70 dark:bg-amber-500/[0.07]", isToday && "bg-rose-50/60 dark:bg-rose-500/[0.06]")}>
                  <span className="text-[11px] uppercase text-muted-foreground">{DAYS[d.getDay()]}</span>
                  <span className={cn("inline-flex size-6 items-center justify-center rounded-md text-xs", isToday ? "bg-rose-500 font-semibold text-white" : holiday ? "font-semibold text-amber-700 dark:text-amber-300" : "font-medium text-foreground")}>{d.getDate()}</span>
                </div>
              );
            })}
          </div>

          {/* Franja "todo el día" (tareas, rodajes, eventos all-day) */}
          <div className="grid shrink-0 border-b border-border" style={{ gridTemplateColumns: `44px repeat(${dayCount}, minmax(0,1fr))` }}>
            <div className="flex items-center justify-end pr-1.5 text-[9px] text-muted-foreground">todo el día</div>
            {days.map((d) => {
              // Agrupados por tipo y título (compareChips) y COMPACTOS: se ven ~5 y el resto
              // queda tras el scroll del propio día — un día con 20 entregas ya no estira la
              // franja de toda la semana. El contador de abajo avisa que hay más.
              const chips = parsed.filter((p) => !p.timed && evOnDay(p.start, d)).sort((a, b) => compareChips(a.it, b.it));
              const isToday = sameDay(d, today);
              const holiday = holidayName(localDateStr(d));
              const wknd = dayCount === 7 && (d.getDay() === 0 || d.getDay() === 6);
              return (
                <div key={d.toISOString()} className={cn("min-h-8 p-1", wknd && !isToday && "bg-muted/25", isToday && "bg-rose-50/40 dark:bg-rose-500/[0.04]")}>
                  {holiday ? (
                    <div className="mb-1 flex w-full items-center gap-1 truncate rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" title={`Festivo en Colombia: ${holiday}`}>
                      <span className="truncate">🎉 {holiday}</span>
                    </div>
                  ) : null}
                  <div className={cn("space-y-1 overscroll-contain", chips.length > MAX_ALLDAY_VISIBLE && "max-h-[132px] overflow-y-auto")}>
                  {chips.map((p) => {
                    return (
                      <button key={p.it.id} onClick={() => highlight(p.it)} onDoubleClick={() => openDetail(p.it)}
                        className={cn("flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium text-white transition-all hover:brightness-105", selectedId === p.it.id ? "ring-2 ring-foreground/70 ring-offset-1" : "")}
                        style={{ background: blockColor(p.it, itemSolid(p.it)) }}
                        title={`${p.it.title}${projTip(p.it)} · doble clic para ver el detalle`}>
                        <KindGlyph kind={p.it.kind} /><span className="truncate">{p.it.title}</span>
                      </button>
                    );
                  })}
                  </div>
                  {chips.length > MAX_ALLDAY_VISIBLE ? (
                    <div className="pt-0.5 text-center text-[9px] font-medium text-muted-foreground">{chips.length} en el día · desliza</div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Rejilla de horas (scroll, llena el alto disponible) */}
          <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto", drag && "select-none")}>
            <div ref={gridRef} className="relative grid" style={{ gridTemplateColumns: `${GUTTER}px repeat(${dayCount}, minmax(0,1fr))`, height: VISIBLE_HOURS * hourH }}>
              {/* Columna de horas */}
              <div className="relative">
                {hours.map((h, idx) => (
                  <div key={h} style={{ height: hourH }} className="relative">
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
                const wknd = dayCount === 7 && (d.getDay() === 0 || d.getDay() === 6);
                return (
                  <div
                    key={d.toISOString()}
                    onClick={canCreate ? (e) => {
                      // Tras arrastrar un bloque, el navegador dispara un click sintético que —al no
                      // capturar el puntero— cae en la COLUMNA (el bloque no sigue al cursor). Sin este
                      // guard, cada arrastre/redimensión abriría el modal de "crear". Consume el flag.
                      if (suppressClick.current) { suppressClick.current = false; return; }
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top;
                      const minutes = Math.max(START_MIN, Math.min(END_HOUR * 60 - 15, START_MIN + (y / hourH) * 60));
                      const hh = Math.floor(minutes / 60);
                      const mm = (Math.round((minutes % 60) / 15) * 15) % 60;
                      emitCalendarCreate(localDateStr(d), `${pad2(hh)}:${pad2(mm)}`);
                    } : undefined}
                    className={cn("relative border-l border-border/70", wknd && !isToday && "bg-muted/25", isToday && "bg-rose-50/30 dark:bg-rose-500/[0.03]", canCreate && "cursor-pointer")}
                  >
                    {hours.map((h) => (<div key={h} style={{ height: hourH }} className="border-b border-border/50" />))}
                    {isToday ? <NowLine hourH={hourH} /> : null}
                    {positioned.map((p) => {
                      const t = calTone(p.it.kind);
                      const top = minToTop(p.topMin, hourH);
                      const height = Math.max(18, ((p.endMin - p.topMin) / 60) * hourH);
                      const tiny = height < 30; // bloques muy cortos: una sola línea
                      const draggable = isMovable(p.it);
                      const canResize = Boolean(p.it.eventId); // solo las citas tienen duración; las tareas se mueven pero no se redimensionan
                      const isDragging = drag?.id === p.it.id;
                      // Sufijo del tooltip: doble clic abre el detalle; mantener+arrastrar mueve.
                      const hint = [draggable ? (canResize ? "mantén y arrastra para mover, tira del borde para la duración" : "mantén y arrastra para reprogramar") : "", "doble clic para ver el detalle"].filter(Boolean).join(" · ");
                      return (
                        <button
                          key={p.it.id}
                          onPointerDown={draggable ? (e) => armMove(e, p, dayIndex) : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (suppressClick.current) { suppressClick.current = false; return; }
                            highlight(p.it);
                          }}
                          onDoubleClick={(e) => { e.stopPropagation(); openDetail(p.it); }}
                          className={cn(
                            "group absolute flex flex-col overflow-hidden rounded-lg px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-md shadow-black/20 transition-all hover:brightness-105 hover:shadow-lg",
                            selectedId === p.it.id ? "ring-2 ring-foreground/70 ring-offset-1" : "",
                            draggable && "cursor-grab active:cursor-grabbing",
                            isDragging && "opacity-40",
                          )}
                          style={{ top, height, left: `calc(${p.left}% + 2px)`, width: `calc(${p.width}% - 4px)`, background: blockColor(p.it, t.solid), color: "#fff", touchAction: draggable ? "none" : undefined }}
                          title={`${p.it.title}${projTip(p.it)}${hint ? ` · ${hint}` : ""}`}>
                          <span className="truncate font-semibold">{p.it.title}</span>
                          {p.it.time && !tiny ? <span className="truncate text-white/80">{p.it.time}</span> : null}
                          {/* Proyecto de la tarea (discreto): segunda línea solo si el bloque tiene espacio. */}
                          {p.it.kind === "task" && p.it.projectName && !tiny ? (
                            <span className="truncate text-[10px] text-white/75"><EntityEmoji value={p.it.projectEmoji} fallback="🗂️" /> {p.it.projectName}</span>
                          ) : null}
                          {draggable && canResize ? (
                            <span
                              onPointerDown={(e) => startResize(e, p, dayIndex)}
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
                  const top = minToTop(preview.topMin, hourH);
                  const height = Math.max(18, ((preview.endMin - preview.topMin) / 60) * hourH);
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

function NowLine({ hourH }: { hourH: number }) {
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
  return <div className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-rose-500" style={{ top: minToTop(min, hourH) }}><span className="absolute -left-1 -top-1 size-2 rounded-full bg-rose-500" /></div>;
}
