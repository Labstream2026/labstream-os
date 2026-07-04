"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronRight, ChevronDown, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type TimelineUnit,
  DAY_WIDTH,
  computeRange,
  monthSegments,
  dayNumberOf,
  keyOfDayNumber,
  todayKey,
  isWeekend,
  isMonday,
  dayOfMonth,
  weekdayInitial,
  barSpan,
} from "@/lib/timeline";

export type TLBar = {
  id: string;
  label: string;
  startKey: string | null;
  endKey: string | null;
  colorHex: string;
  progress?: number; // 0..100
  done?: boolean;
  badge?: React.ReactNode;
  sublabel?: string;
  editable?: boolean;
  onClick?: () => void;
  // Filas hijas (p. ej. tareas de un proyecto). Si las hay, la fila muestra un chevron
  // y al desplegar se ven debajo, indentadas.
  children?: TLBar[];
  defaultExpanded?: boolean;
};

export type TLMilestone = {
  id: string;
  dayKey: string;
  label: string;
  emoji: string;
  colorHex: string;
  dateLabel?: string; // fecha legible para el popover de detalle
  link?: string; // a dónde lleva "Abrir" (p. ej. el cronograma del proyecto)
  onClick?: () => void;
  editable?: boolean; // se puede ARRASTRAR el chip para reprogramarlo (o cambiar la fecha en el popover)
};

export type TLLane = {
  key: string;
  label: string;
  colorHex?: string;
  bars?: TLBar[];
  milestones?: TLMilestone[];
};

const LABEL_W = 200;

type DragState = {
  id: string;
  mode: "move" | "resizeStart" | "resizeEnd";
  startX: number;
  origOffset: number;
  origSpan: number;
};

export function TimelineGrid({
  lanes,
  unit,
  onUnitChange,
  onBarChange,
  onMilestoneChange,
  emptyHint,
  lockUnit = false,
  maxHeight,
  compact = false,
}: {
  lanes: TLLane[];
  unit: TimelineUnit;
  onUnitChange: (u: TimelineUnit) => void;
  onBarChange?: (id: string, dates: { startKey: string; endKey: string }) => void;
  // Arrastrar un hito editable (rodaje/entrega) a otro día → reprograma su fecha.
  onMilestoneChange?: (id: string, dayKey: string) => void;
  emptyHint?: string;
  // Oculta el selector Día/Semana/Mes (p. ej. el resumen del Inicio, fijo en Mes).
  lockUnit?: boolean;
  // Si se indica, el cronograma tiene su propio scroll (vertical + horizontal) acotado
  // a esa altura, en vez de crecer hacia abajo indefinidamente.
  maxHeight?: string;
  // Modo compacto (resumen del Inicio): filas más bajas y sin leyenda, para una vista
  // general corta de los proyectos. Las tareas se omiten desde GlobalTimeline.
  compact?: boolean;
}) {
  const dayWidth = DAY_WIDTH[unit];
  const ROW_H = compact ? 26 : 34;
  const LANE_H = compact ? 24 : 30;
  const BAR_H = compact ? 15 : 22;

  // Todas las claves de fecha presentes (barras + hitos) para acotar el rango.
  const keys: (string | null)[] = [];
  for (const lane of lanes) {
    for (const b of lane.bars ?? []) {
      keys.push(b.startKey, b.endKey);
    }
    for (const m of lane.milestones ?? []) keys.push(m.dayKey);
  }
  const { startNum, endNum } = computeRange(keys);
  const totalDays = endNum - startNum + 1;
  const trackW = totalDays * dayWidth;
  const months = monthSegments(startNum, endNum);
  const todayNum = dayNumberOf(todayKey());
  const todayOffset = (todayNum - startNum) * dayWidth;
  // Solo dibujamos el cabezal de "hoy" si la fecha de hoy cae dentro del rango visible.
  const todayInRange = todayNum >= startNum && todayNum <= endNum;
  const showDayBand = unit !== "month";

  // Arrastre/redimensionado: draft local de la barra activa.
  const [draft, setDraft] = React.useState<{ id: string; offsetDays: number; spanDays: number } | null>(null);
  const dragRef = React.useRef<DragState | null>(null);

  // Arrastre de un HITO (chip de rodaje/entrega) para reprogramarlo. Draft = su día durante el
  // arrastre; el ref distingue un clic (abre el popover) de un arrastre (reprograma).
  const [msDraft, setMsDraft] = React.useState<{ id: string; dayNum: number } | null>(null);
  const msDragRef = React.useRef<{ id: string; startX: number; origDayNum: number; moved: boolean; m: TLMilestone; rect: DOMRect } | null>(null);
  function onMsPointerDown(e: React.PointerEvent, m: TLMilestone) {
    if (!m.editable || !onMilestoneChange) return; // no editable → el onClick abre el popover
    e.preventDefault();
    e.stopPropagation();
    // setPointerCapture puede lanzar si el puntero ya no está activo (carrera con pointerup):
    // que un fallo de captura no rompa el resto del arrastre.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const origDayNum = dayNumberOf(m.dayKey);
    msDragRef.current = { id: m.id, startX: e.clientX, origDayNum, moved: false, m, rect };
    setMsDraft({ id: m.id, dayNum: origDayNum });
  }
  function onMsPointerMove(e: React.PointerEvent) {
    const d = msDragRef.current;
    if (!d) return;
    const deltaDays = Math.round((e.clientX - d.startX) / dayWidth);
    if (deltaDays !== 0) d.moved = true;
    setMsDraft({ id: d.id, dayNum: Math.max(startNum, Math.min(endNum, d.origDayNum + deltaDays)) });
  }
  function onMsPointerUp() {
    const d = msDragRef.current;
    const dr = msDraft;
    msDragRef.current = null;
    setMsDraft(null);
    if (!d) return;
    if (d.moved && dr && dr.dayNum !== d.origDayNum && onMilestoneChange) {
      onMilestoneChange(d.id, keyOfDayNumber(dr.dayNum));
    } else {
      // Clic sin arrastre → abre el detalle en la posición del chip.
      setOpenMs((cur) => (cur?.m.id === d.m.id ? null : { m: d.m, x: d.rect.left + d.rect.width / 2, y: d.rect.bottom }));
    }
  }

  // Expansión de filas con hijos (proyecto → tareas).
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const lane of lanes) for (const b of lane.bars ?? []) if (b.defaultExpanded) s.add(b.id);
    return s;
  });
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Popover de detalle de un hito (rodaje/entrega). Se ancla con coordenadas de viewport
  // (posición fija) para que NO se recorte por el scroll del cronograma. Se cierra al hacer
  // clic fuera, al desplazar o con Escape.
  const [openMs, setOpenMs] = React.useState<{ m: TLMilestone; x: number; y: number } | null>(null);
  React.useEffect(() => {
    if (!openMs) return;
    const close = () => setOpenMs(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenMs(null); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMs]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  // Centrar en "hoy" al montar / cambiar zoom.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, todayOffset - el.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  function onPointerDown(e: React.PointerEvent, bar: TLBar, mode: DragState["mode"], offsetDays: number, spanDays: number) {
    if (!bar.editable || !onBarChange) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: bar.id, mode, startX: e.clientX, origOffset: offsetDays, origSpan: spanDays };
    setDraft({ id: bar.id, offsetDays, spanDays });
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const deltaDays = Math.round((e.clientX - d.startX) / dayWidth);
    if (d.mode === "move") {
      setDraft({ id: d.id, offsetDays: d.origOffset + deltaDays, spanDays: d.origSpan });
    } else if (d.mode === "resizeStart") {
      const span = Math.max(1, d.origSpan - deltaDays);
      const offset = d.origOffset + (d.origSpan - span);
      setDraft({ id: d.id, offsetDays: offset, spanDays: span });
    } else {
      setDraft({ id: d.id, offsetDays: d.origOffset, spanDays: Math.max(1, d.origSpan + deltaDays) });
    }
  }
  function onPointerUp() {
    const d = dragRef.current;
    const dr = draft;
    dragRef.current = null;
    if (d && dr && (dr.offsetDays !== d.origOffset || dr.spanDays !== d.origSpan) && onBarChange) {
      const startKey = keyOfDayNumber(startNum + dr.offsetDays);
      const endKey = keyOfDayNumber(startNum + dr.offsetDays + dr.spanDays - 1);
      onBarChange(d.id, { startKey, endKey });
    }
    setDraft(null);
  }

  // Renderiza la fila de una barra y, si está expandida, sus hijas indentadas.
  function renderBar(bar: TLBar, depth: number): React.ReactNode[] {
    const span = barSpan(bar.startKey, bar.endKey, startNum);
    const useDraft = draft && draft.id === bar.id ? draft : null;
    const offsetDays = useDraft ? useDraft.offsetDays : span?.offsetDays ?? 0;
    const spanDays = useDraft ? useDraft.spanDays : span?.spanDays ?? 1;
    const left = offsetDays * dayWidth;
    const width = Math.max(spanDays * dayWidth, 12);
    const hex = bar.colorHex;
    // Señal de urgencia (no pisa el color de fase): barra VENCIDA = sin terminar y su fecha
    // de fin ya pasó. Se resalta con un anillo rojo.
    const overdue = !bar.done && bar.endKey ? dayNumberOf(bar.endKey) < todayNum : false;
    const hasChildren = !!(bar.children && bar.children.length);
    const isOpen = expanded.has(bar.id);
    const rows: React.ReactNode[] = [];
    rows.push(
      <div key={bar.id} className="flex border-b border-border/40" style={{ height: ROW_H }}>
        <div
          className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-border bg-card pr-3"
          style={{ width: LABEL_W, paddingLeft: 8 + depth * 14 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(bar.id)}
              className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
              title={isOpen ? "Contraer" : "Expandir tareas"}
            >
              {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          {bar.badge}
          <button
            type="button"
            onClick={hasChildren ? () => toggleExpand(bar.id) : bar.onClick}
            className="min-w-0 flex-1 truncate text-left text-xs hover:text-primary"
            title={bar.label}
          >
            {bar.label}
          </button>
          {bar.sublabel ? <span className="shrink-0 text-[10px] text-muted-foreground">{bar.sublabel}</span> : null}
        </div>
        <div className="relative" style={{ width: trackW }}>
          {span ? (
            <div
              onClick={(e) => { if (!dragRef.current) bar.onClick?.(); e.stopPropagation(); }}
              onPointerDown={(e) => onPointerDown(e, bar, "move", offsetDays, spanDays)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className={cn(
                "group absolute top-1/2 flex -translate-y-1/2 items-center overflow-hidden rounded-md border",
                bar.editable && onBarChange ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                overdue && "ring-2 ring-rose-500",
              )}
              style={{
                left,
                width,
                height: BAR_H,
                backgroundColor: bar.done ? hex : `${hex}22`,
                borderColor: `${hex}99`,
                touchAction: "none",
              }}
            >
              {!bar.done && bar.progress ? (
                <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, bar.progress)}%`, backgroundColor: `${hex}55` }} />
              ) : null}
              {bar.editable && onBarChange ? (
                <>
                  <span
                    onPointerDown={(e) => onPointerDown(e, bar, "resizeStart", offsetDays, spanDays)}
                    className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
                    style={{ backgroundColor: hex }}
                  />
                  <span
                    onPointerDown={(e) => onPointerDown(e, bar, "resizeEnd", offsetDays, spanDays)}
                    className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100"
                    style={{ backgroundColor: hex }}
                  />
                </>
              ) : null}
              <span className={cn("relative z-[5] truncate px-2 text-[11px]", bar.done ? "text-white" : "text-foreground")}>
                {bar.done ? <Check className="mr-0.5 inline size-3" /> : null}
                {bar.label}
              </span>
            </div>
          ) : null}
        </div>
      </div>,
    );
    if (hasChildren && isOpen) {
      for (const child of bar.children!) rows.push(...renderBar(child, depth + 1));
    }
    return rows;
  }

  const hasContent = lanes.some((l) => (l.bars?.length ?? 0) > 0 || (l.milestones?.length ?? 0) > 0);

  return (
    <div className="space-y-2">
      {!hasContent ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center text-sm text-muted-foreground">
          {emptyHint ?? "Aún no hay nada con fechas para mostrar en el cronograma."}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className={cn("rounded-xl border border-border bg-card", maxHeight ? "overflow-auto" : "overflow-x-auto")}
          style={maxHeight ? { maxHeight } : undefined}
        >
          <div style={{ width: LABEL_W + trackW, minWidth: "100%" }}>
            {/* Cabecera: meses + días */}
            <div className="sticky top-0 z-30 flex border-b border-border bg-card">
              {/* Selector de vista (Día/Semana) JUNTO a «Cronograma» + botón Hoy, en la celda
                  fija de la cabecera: compacta la interfaz y deja más espacio al cronograma. */}
              <div
                className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-card px-2 py-1"
                style={{ width: LABEL_W }}
              >
                {lockUnit ? (
                  <span className="text-[11px] font-medium text-muted-foreground">Cronograma</span>
                ) : (
                  <div className="inline-flex overflow-hidden rounded-md border border-border text-[11px]">
                    {(["day", "week"] as TimelineUnit[]).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => onUnitChange(u)}
                        className={cn(
                          "px-2 py-0.5 font-medium transition-colors",
                          unit === u ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {u === "day" ? "Día" : "Semana"}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const el = scrollRef.current;
                    if (el) el.scrollTo({ left: Math.max(0, todayOffset - el.clientWidth / 3), behavior: "smooth" });
                  }}
                  className="ml-auto rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
                >
                  Hoy
                </button>
              </div>
              <div className="relative" style={{ width: trackW, height: showDayBand ? 42 : 24 }}>
                {/* Cabezal de HOY: etiqueta en la cabecera, alineada con la línea vertical
                    del cuerpo, para ubicar de un vistazo el día actual. */}
                {todayInRange ? (
                  <div className="pointer-events-none absolute bottom-0 z-20 -translate-x-1/2" style={{ left: todayOffset }}>
                    <span className="rounded-sm bg-primary px-1 py-0.5 text-[8px] font-bold uppercase leading-none tracking-wide text-primary-foreground shadow-sm">
                      Hoy
                    </span>
                  </div>
                ) : null}
                {/* Banda de meses */}
                {months.map((seg) => (
                  <div
                    key={seg.key}
                    className="absolute top-0 truncate border-r border-border/60 px-2 text-[11px] font-semibold capitalize text-foreground"
                    style={{ left: seg.offsetDays * dayWidth, width: seg.days * dayWidth, height: showDayBand ? 20 : 24, lineHeight: "20px" }}
                  >
                    {seg.label}
                  </div>
                ))}
                {/* Banda de días */}
                {showDayBand &&
                  Array.from({ length: totalDays }, (_, i) => {
                    const num = startNum + i;
                    const isToday = num === todayNum;
                    const showLabel = unit === "day" || isMonday(num);
                    return (
                      <div
                        key={i}
                        className={cn(
                          "absolute top-5 flex flex-col items-center justify-center border-r border-border/40 text-[9px]",
                          isWeekend(num) ? "bg-muted/40 text-muted-foreground" : "text-muted-foreground",
                        )}
                        style={{ left: i * dayWidth, width: dayWidth, height: 22 }}
                      >
                        {showLabel ? (
                          <span className={cn("leading-none", isToday && "font-bold text-primary")}>{dayOfMonth(num)}</span>
                        ) : null}
                        {unit === "day" ? <span className="leading-none opacity-60">{weekdayInitial(num)}</span> : null}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Cuerpo */}
            <div className="relative">
              {/* Capa de fondo: fines de semana, líneas de semana y línea de hoy */}
              <div className="pointer-events-none absolute inset-y-0 z-0" style={{ left: LABEL_W, width: trackW }}>
                {Array.from({ length: totalDays }, (_, i) => {
                  const num = startNum + i;
                  if (!isWeekend(num) && !isMonday(num)) return null;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "absolute inset-y-0",
                        isWeekend(num) && "bg-muted/30",
                        isMonday(num) && "border-l border-border/50",
                      )}
                      style={{ left: i * dayWidth, width: dayWidth }}
                    />
                  );
                })}
                {todayInRange ? (
                  <div className="absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-primary text-primary" style={{ left: todayOffset }}>
                    {/* Punta del cabezal (triángulo) apuntando hacia abajo desde la cabecera */}
                    <div
                      className="absolute -top-1 left-1/2 size-0 -translate-x-1/2"
                      style={{ borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid currentColor" }}
                    />
                  </div>
                ) : null}
              </div>

              {/* Carriles */}
              {lanes.map((lane) => (
                <div key={lane.key} className="relative z-10">
                  {/* Cabecera del carril */}
                  <div className="flex border-b border-border/60 bg-muted/30" style={{ height: LANE_H }}>
                    <div
                      className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-border bg-muted/30 px-3 text-xs font-semibold"
                      style={{ width: LABEL_W }}
                    >
                      {lane.colorHex ? <span className="inline-block size-2 rounded-full" style={{ backgroundColor: lane.colorHex }} /> : null}
                      <span className="truncate">{lane.label}</span>
                    </div>
                    <div className="relative" style={{ width: trackW }}>
                      {/* Hitos del carril (rodajes/entregas). Si son editables se pueden ARRASTRAR
                          a otro día para reprogramarlos; el clic (sin arrastrar) abre el detalle. */}
                      {(lane.milestones ?? []).map((m) => {
                        const drag = !!m.editable && !!onMilestoneChange;
                        const dragging = !!msDraft && msDraft.id === m.id;
                        const dnum = dragging ? msDraft!.dayNum : dayNumberOf(m.dayKey);
                        const left = (dnum - startNum) * dayWidth;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={drag ? undefined : (e) => {
                              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setOpenMs((cur) => (cur?.m.id === m.id ? null : { m, x: r.left + r.width / 2, y: r.bottom }));
                            }}
                            onPointerDown={drag ? (e) => onMsPointerDown(e, m) : undefined}
                            onPointerMove={drag ? onMsPointerMove : undefined}
                            onPointerUp={drag ? onMsPointerUp : undefined}
                            title={drag ? `${m.emoji} ${m.label} · arrastra para reprogramar` : `${m.emoji} ${m.label}`}
                            className={cn(
                              "absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center",
                              drag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                              dragging ? "z-30" : "z-10",
                            )}
                            style={{ left, touchAction: drag ? "none" : undefined }}
                          >
                            <span
                              className={cn("flex size-5 items-center justify-center rounded-full border text-[10px] shadow-sm", dragging && "ring-2 ring-primary")}
                              style={{ backgroundColor: `${m.colorHex}22`, borderColor: `${m.colorHex}99` }}
                            >
                              {m.emoji}
                            </span>
                            {dragging ? (
                              <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[9px] font-medium text-background shadow">
                                {keyOfDayNumber(msDraft!.dayNum).slice(5)}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Filas de barras (con hijos expandibles) */}
                  {(lane.bars ?? []).flatMap((bar) => renderBar(bar, 0))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Detalle del hito al hacer clic en su marcador (qué es, cuándo, y abrir). */}
      {openMs ? (
        <div className="fixed inset-0 z-[60]" onClick={() => setOpenMs(null)}>
          <div
            className="absolute w-60 -translate-x-1/2 rounded-lg border border-border bg-card p-3 shadow-lg"
            style={{ left: openMs.x, top: openMs.y + 8 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-start gap-2">
              <span className="text-base leading-none">{openMs.m.emoji}</span>
              <span className="flex-1 text-sm font-semibold leading-snug">{openMs.m.label}</span>
              <button type="button" onClick={() => setOpenMs(null)} aria-label="Cerrar" className="shrink-0 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            {openMs.m.dateLabel ? <p className="text-xs text-muted-foreground">{openMs.m.dateLabel}</p> : null}
            {openMs.m.editable && onMilestoneChange ? (
              <div className="mt-2">
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Reprogramar a otra fecha</label>
                <input
                  type="date"
                  defaultValue={openMs.m.dayKey}
                  onChange={(e) => { if (e.target.value) { onMilestoneChange(openMs.m.id, e.target.value); setOpenMs(null); } }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">Se actualiza el calendario y se avisa a los citados.</p>
              </div>
            ) : null}
            {openMs.m.link ? (
              <Link href={openMs.m.link} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Abrir <ArrowRight className="size-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
