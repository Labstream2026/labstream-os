"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { emitCalendarCreate, emitCalendarDetail, calTone, itemSolid, personColor, type ColorBy } from "./calendar-detail";
import { moveMyEvent } from "./actions";
import { holidayName } from "@/lib/holidays-co";
import { emojiToText } from "@/components/icons/marks";
// El orden de agrupación de los chips vive en week-view (compareChips); importarlo aquí no crea
// ciclo en runtime porque week-view solo importa de este archivo el TIPO CalItem (se borra al compilar).
import { compareChips, KindGlyph } from "./week-view";

// Chips visibles por celda del mes antes de que el resto quede tras el scroll de la celda.
const MAX_MONTH_VISIBLE = 4;

type Person = { name: string; initials: string | null; color: string | null };
export type TeamMember = { id: string; name: string; initials: string | null; color: string | null };

export type CalItem = {
  id: string;
  title: string;
  date: string; // ISO (inicio) — usado por la vista mensual
  kind: "event" | "task" | "shoot" | "milestone";
  urgencyHex?: string | null; // color por urgencia (solo entregas/tareas con fecha)
  time?: string | null; // "HH:mm" del inicio (eventos con hora)
  projectName?: string | null;
  // ── Campos para la vista semanal y el panel de detalle (opcionales) ──
  start?: string; // ISO de inicio (si difiere de date)
  end?: string | null; // ISO de fin
  endTime?: string | null; // "HH:mm" del fin
  allDay?: boolean;
  projectEmoji?: string | null;
  assignee?: Person | null;
  attendees?: Person[];
  link?: string | null;
  description?: string | null;
  location?: string | null; // sala o enlace de reunión (Meet/Zoom)
  guests?: string[]; // correos de invitados externos
  // ── Edición (solo eventos creados en la app por el usuario actual) ──
  eventId?: string; // id real del evento (sin prefijo)
  canEdit?: boolean; // el usuario actual lo creó y es un evento de la app
  attendeeIds?: string[]; // ids de los asistentes actuales
  // ── RSVP (solo eventos donde el usuario actual es invitado) ──
  canRsvp?: boolean; // el usuario actual es asistente de esta cita → puede responder
  myStatus?: string | null; // su respuesta actual: ACCEPTED | DECLINED | TENTATIVE | null (sin responder)
  // ── Mover el bloque en la vista Semana/Día (arrastrar para reprogramar) ──
  taskId?: string; // id real de la tarea (para reprogramar su fecha/hora al arrastrar el bloque)
  canMoveTask?: boolean; // el usuario puede reprogramar esta tarea (dueño/asignado/gestor del proyecto)
  canMoveEvent?: boolean; // el usuario puede MOVER esta cita (creador o admin/productor); notifica a los citados
};

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function dayKey(d: string): string | null {
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// Calendario mensual del usuario: combina sus eventos (reuniones, citas) y sus
// tareas con fecha de entrega. Base lista para sincronizar con Synology Calendar.
export function MyCalendar({
  items,
  canCreate = false,
  colorBy = "tipo",
  anchor,
  onAnchorChange,
}: {
  items: CalItem[];
  canCreate?: boolean;
  colorBy?: ColorBy;
  // Fecha ancla controlada por el calendario "shell" (mini-calendario / barra superior).
  // Si se pasa `onAnchorChange`, la barra propia de esta vista se oculta (la controla el shell).
  anchor?: Date;
  onAnchorChange?: (d: Date) => void;
}) {
  const now = new Date();
  const controlled = Boolean(onAnchorChange);
  const [year, setYear] = useState(() => anchor?.getFullYear() ?? now.getFullYear());
  const [month, setMonth] = useState(() => anchor?.getMonth() ?? now.getMonth());
  // Cuando el shell cambia la fecha ancla (p. ej. desde el mini-calendario), la ventana mensual
  // salta a ese mes.
  useEffect(() => {
    if (anchor) { setYear(anchor.getFullYear()); setMonth(anchor.getMonth()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor?.getFullYear(), anchor?.getMonth()]);
  const [overKey, setOverKey] = useState<string | null>(null);
  const dragItem = useRef<CalItem | null>(null);
  const [, startMove] = useTransition();

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of items) {
      const k = dayKey(it.date);
      if (!k) continue;
      (map.get(k) ?? map.set(k, []).get(k)!).push(it);
    }
    return map;
  }, [items]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  // La vista mes muestra una ventana CONTINUA de varios meses (no se corta en el mes actual);
  // se desplaza mes a mes con ←/→ y "Hoy" vuelve al mes en curso.
  const MONTH_COUNT = 6;
  const prev = () => (month === 0 ? (setMonth(11), setYear((y) => y - 1)) : setMonth((m) => m - 1));
  const next = () => (month === 11 ? (setMonth(0), setYear((y) => y + 1)) : setMonth((m) => m + 1));

  // Soltar una cita en otro día (de cualquier mes visible): conserva la hora, cambia la fecha.
  const dropOnDay = (y: number, m: number, dayNum: number) => {
    const it = dragItem.current;
    dragItem.current = null;
    setOverKey(null);
    if (!it?.eventId || !it.canEdit) return;
    const orig = new Date(it.start ?? it.date);
    // Convención del calendario: "hora de pared en UTC" (como week-view). Con getHours()/new
    // Date(y,m,d,…) locales, esto solo era correcto en navegadores en UTC-5; en cualquier otro
    // huso la cita saltaba de hora al soltarla.
    const ns = new Date(Date.UTC(y, m, dayNum, orig.getUTCHours(), orig.getUTCMinutes(), 0, 0));
    const dur = it.end ? new Date(it.end).getTime() - orig.getTime() : 0;
    const ne = dur ? new Date(ns.getTime() + dur) : null;
    startMove(() => { void moveMyEvent(it.eventId!, ns.toISOString(), ne ? ne.toISOString() : null); });
  };

  // Los MONTH_COUNT meses visibles a partir del mes/año actual (normalizados por Date).
  const months = Array.from({ length: MONTH_COUNT }, (_, i) => {
    const dt = new Date(year, month + i, 1);
    return { y: dt.getFullYear(), m: dt.getMonth() };
  });
  const startDt = new Date(year, month, 1);
  const endDt = new Date(year, month + MONTH_COUNT - 1, 1);
  const rangeLabel = startDt.getFullYear() === endDt.getFullYear()
    ? `${MONTHS[startDt.getMonth()]} – ${MONTHS[endDt.getMonth()]} ${endDt.getFullYear()}`
    : `${MONTHS[startDt.getMonth()]} ${startDt.getFullYear()} – ${MONTHS[endDt.getMonth()]} ${endDt.getFullYear()}`;

  // Rejilla de un mes (cabecera con su nombre + celdas). Reutilizada por los 6 meses.
  const monthGrid = (y: number, m: number) => {
    const startOffset = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return (
      <div key={`${y}-${m}`}>
        <div className="sticky top-9 z-[1] flex items-center gap-2 bg-card/95 px-1 py-1.5 backdrop-blur">
          <span className="text-sm font-semibold capitalize">{MONTHS[m]} {y}</span>
          <span className="h-px flex-1 bg-border/50" />
        </div>
        <div className="grid grid-cols-7 border-t border-border/70">
          {cells.map((d, i) => {
            const key = d ? `${y}-${pad(m + 1)}-${pad(d)}` : null;
            // Copia ordenada (compareChips agrupa por tipo → hora → título) y compacta: se ven
            // ~4 y el resto queda tras el scroll de la propia celda, con contador debajo.
            const evs = (key ? [...(byDay.get(key) ?? [])] : []).sort(compareChips);
            const isToday = key === todayKey;
            const isOver = key != null && overKey === key;
            const holiday = key ? holidayName(key) : null;
            return (
              <div
                key={i}
                onClick={() => { if (d && key && canCreate) emitCalendarCreate(key); }}
                onDragOver={d ? (e) => { if (dragItem.current) { e.preventDefault(); if (key !== overKey) setOverKey(key); } } : undefined}
                onDrop={d ? (e) => { e.preventDefault(); dropOnDay(y, m, d); } : undefined}
                className={cn(
                  "min-h-[100px] border-b border-l border-border/60 p-1 [&:nth-child(7n+1)]:border-l-0",
                  !d && "bg-muted/20",
                  holiday && !isToday && "bg-amber-50/70 dark:bg-amber-500/[0.07]",
                  isToday && "bg-rose-50/40 dark:bg-rose-500/[0.05]",
                  isOver && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                  d && canCreate && "cursor-pointer hover:bg-muted/30",
                )}
              >
                {d ? (
                  <>
                    <div className="mb-1 flex justify-start">
                      <span className={cn(
                        "inline-flex size-6 items-center justify-center rounded-md text-xs",
                        isToday ? "bg-rose-500 font-semibold text-white" : holiday ? "font-semibold text-amber-700 dark:text-amber-300" : "font-medium text-muted-foreground",
                      )}>{d}</span>
                    </div>
                    {holiday ? (
                      <div className="mb-1 truncate rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-200" title={`Festivo en Colombia: ${holiday}`}>
                        🎉 {holiday}
                      </div>
                    ) : null}
                    <div className={cn("space-y-1 overscroll-contain", evs.length > MAX_MONTH_VISIBLE && "max-h-[104px] overflow-y-auto")}>
                      {evs.map((ev) => {
                        const draggable = Boolean(ev.canEdit && ev.eventId);
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            draggable={draggable}
                            onDragStart={draggable ? (e) => { dragItem.current = ev; e.dataTransfer.effectAllowed = "move"; } : undefined}
                            onDragEnd={() => { dragItem.current = null; setOverKey(null); }}
                            onClick={(e) => { e.stopPropagation(); }}
                            onDoubleClick={(e) => { e.stopPropagation(); emitCalendarDetail(ev); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); emitCalendarDetail(ev); } }}
                            title={`${ev.title}${ev.projectName ? ` · ${emojiToText(ev.projectEmoji, "🗂️")} ${ev.projectName}` : ""}${draggable ? " · arrastra a otro día para mover" : ""} · doble clic para ver el detalle`}
                            className={cn(
                              "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white transition-all hover:brightness-105",
                              draggable && "cursor-grab active:cursor-grabbing",
                            )}
                            style={{ background: colorBy === "persona" ? personColor(ev) ?? itemSolid(ev) : itemSolid(ev) }}
                          >
                            <span className="flex items-center gap-1"><KindGlyph kind={ev.kind} />{ev.time ? <span>{ev.time}</span> : null}<span className="truncate">{ev.title}</span></span>
                          </button>
                        );
                      })}
                    </div>
                    {evs.length > MAX_MONTH_VISIBLE ? (
                      <div className="pt-0.5 text-center text-[9px] font-medium text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                        {evs.length} en el día · desliza
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {controlled ? null : (
      <div className="flex shrink-0 items-center justify-between pb-2">
        <h3 className="text-sm font-semibold capitalize">{rangeLabel}</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={prev} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">←</button>
          <button type="button" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Hoy</button>
          <button type="button" onClick={next} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">→</button>
        </div>
      </div>
      )}

      {/* Ventana continua de 6 meses con scroll propio; cabecera de día fija arriba (estilo Notion).
          Ancho mínimo + scroll horizontal: cuando el contenedor es angosto (panel de chat abierto,
          pantallas chicas) la rejilla NO se comprime hasta que las abreviaturas y los números se
          solapan — hace scroll lateral, igual que la vista Semana. */}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
        <div className="min-w-[34rem]">
        <div className="sticky top-0 z-[2] grid grid-cols-7 border-b border-border bg-card">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2 text-center text-[11px] font-medium uppercase text-muted-foreground">{w}</div>
          ))}
        </div>
        {months.map((mo) => monthGrid(mo.y, mo.m))}
        </div>
      </div>

      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded" style={{ background: calTone("event").solid }} /> Citas</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="flex overflow-hidden rounded">
            <span className="size-2.5" style={{ background: "#f43f5e" }} />
            <span className="size-2.5" style={{ background: "#f59e0b" }} />
            <span className="size-2.5" style={{ background: "#22c55e" }} />
          </span>
          Entregas (urgencia)
        </span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded" style={{ background: calTone("shoot").solid }} /> Rodajes</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded" style={{ background: calTone("milestone").solid }} /> Hitos de proyecto</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-amber-300" /> 🎉 Festivos de Colombia</span>
        {canCreate ? <span className="ml-auto">Toca un día para crear · arrastra una cita para moverla.</span> : null}
      </div>
    </div>
  );
}
