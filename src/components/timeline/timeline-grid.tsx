"use client";

import * as React from "react";
import { Check, ChevronRight, ChevronDown } from "lucide-react";
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
  onClick?: () => void;
};

export type TLLane = {
  key: string;
  label: string;
  colorHex?: string;
  bars?: TLBar[];
  milestones?: TLMilestone[];
};

const LABEL_W = 200;
const ROW_H = 34;
const LANE_H = 30;
const BAR_H = 22;

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
  emptyHint,
}: {
  lanes: TLLane[];
  unit: TimelineUnit;
  onUnitChange: (u: TimelineUnit) => void;
  onBarChange?: (id: string, dates: { startKey: string; endKey: string }) => void;
  emptyHint?: string;
}) {
  const dayWidth = DAY_WIDTH[unit];

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
  const showDayBand = unit !== "month";

  // Arrastre/redimensionado: draft local de la barra activa.
  const [draft, setDraft] = React.useState<{ id: string; offsetDays: number; spanDays: number } | null>(null);
  const dragRef = React.useRef<DragState | null>(null);

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
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
          {(["day", "week", "month"] as TimelineUnit[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onUnitChange(u)}
              className={cn(
                "px-3 py-1.5 font-medium transition-colors",
                unit === u ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {u === "day" ? "Día" : u === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-primary/30" /> Tarea</span>
            <span className="inline-flex items-center gap-1">🎬 Rodaje</span>
            <span className="inline-flex items-center gap-1">📦 Entrega</span>
          </div>
          <button
            type="button"
            onClick={() => {
              const el = scrollRef.current;
              if (el) el.scrollTo({ left: Math.max(0, todayOffset - el.clientWidth / 3), behavior: "smooth" });
            }}
            className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
          >
            Hoy
          </button>
        </div>
      </div>

      {!hasContent ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-10 text-center text-sm text-muted-foreground">
          {emptyHint ?? "Aún no hay nada con fechas para mostrar en el cronograma."}
        </div>
      ) : (
        <div ref={scrollRef} className="overflow-x-auto rounded-xl border border-border bg-card">
          <div style={{ width: LABEL_W + trackW, minWidth: "100%" }}>
            {/* Cabecera: meses + días */}
            <div className="sticky top-0 z-30 flex border-b border-border bg-card">
              <div
                className="sticky left-0 z-10 shrink-0 border-r border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground"
                style={{ width: LABEL_W }}
              >
                Cronograma
              </div>
              <div className="relative" style={{ width: trackW, height: showDayBand ? 42 : 24 }}>
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
                <div className="absolute inset-y-0 z-10 w-px bg-primary" style={{ left: todayOffset }}>
                  <div className="absolute -top-0.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-primary" />
                </div>
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
                      {/* Hitos del carril (rodajes/entregas) renderizados en su propia fila */}
                      {(lane.milestones ?? []).map((m) => {
                        const left = (dayNumberOf(m.dayKey) - startNum) * dayWidth;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={m.onClick}
                            title={`${m.emoji} ${m.label}`}
                            className="absolute top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center"
                            style={{ left }}
                          >
                            <span
                              className="flex size-5 items-center justify-center rounded-full border text-[10px] shadow-sm"
                              style={{ backgroundColor: `${m.colorHex}22`, borderColor: `${m.colorHex}99` }}
                            >
                              {m.emoji}
                            </span>
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
    </div>
  );
}
