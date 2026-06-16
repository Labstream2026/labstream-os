"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { emitCalendarCreate, emitCalendarDetail, calTone } from "./calendar-detail";
import { moveMyEvent } from "./actions";

type Person = { name: string; initials: string | null; color: string | null };
export type TeamMember = { id: string; name: string; initials: string | null; color: string | null };

export type CalItem = {
  id: string;
  title: string;
  date: string; // ISO (inicio) — usado por la vista mensual
  kind: "event" | "task" | "shoot" | "milestone";
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
}: {
  items: CalItem[];
  canCreate?: boolean;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
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

  const first = new Date(Date.UTC(year, month, 1));
  const startOffset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (n: number) => String(n).padStart(2, "0");
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const prev = () => (month === 0 ? (setMonth(11), setYear((y) => y - 1)) : setMonth((m) => m - 1));
  const next = () => (month === 11 ? (setMonth(0), setYear((y) => y + 1)) : setMonth((m) => m + 1));

  // Soltar una cita en otro día: conserva la hora, cambia la fecha.
  const dropOnDay = (dayNum: number) => {
    const it = dragItem.current;
    dragItem.current = null;
    setOverKey(null);
    if (!it?.eventId || !it.canEdit) return;
    const orig = new Date(it.start ?? it.date);
    const ns = new Date(year, month, dayNum, orig.getHours(), orig.getMinutes(), 0, 0);
    const dur = it.end ? new Date(it.end).getTime() - orig.getTime() : 0;
    const ne = dur ? new Date(ns.getTime() + dur) : null;
    startMove(() => { void moveMyEvent(it.eventId!, ns.toISOString(), ne ? ne.toISOString() : null); });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between pb-2">
        <h3 className="text-sm font-semibold capitalize">{MONTHS[month]} {year}</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={prev} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">←</button>
          <button type="button" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Hoy</button>
          <button type="button" onClick={next} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">→</button>
        </div>
      </div>

      {/* Rejilla a borde completo, sin tarjeta (estilo Notion) */}
      <div className="overflow-hidden border-t border-border/50 bg-card">
        <div className="grid grid-cols-7 border-b border-border/50">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2 text-center text-[11px] font-medium uppercase text-muted-foreground">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const key = d ? `${year}-${pad(month + 1)}-${pad(d)}` : null;
            const evs = key ? byDay.get(key) ?? [] : [];
            const isToday = key === todayKey;
            const isOver = key != null && overKey === key;
            return (
              <div
                key={i}
                onClick={() => { if (d && key && canCreate) emitCalendarCreate(key); }}
                onDragOver={d ? (e) => { if (dragItem.current) { e.preventDefault(); if (key !== overKey) setOverKey(key); } } : undefined}
                onDrop={d ? (e) => { e.preventDefault(); dropOnDay(d); } : undefined}
                className={cn(
                  "min-h-[104px] border-b border-l border-border/30 p-1 [&:nth-child(7n+1)]:border-l-0",
                  !d && "bg-muted/20",
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
                        isToday ? "bg-rose-500 font-semibold text-white" : "font-medium text-muted-foreground",
                      )}>{d}</span>
                    </div>
                    <div className="space-y-1">
                      {evs.map((ev) => {
                        const t = calTone(ev.kind, ev.kind === "shoot");
                        const draggable = Boolean(ev.canEdit && ev.eventId);
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            draggable={draggable}
                            onDragStart={draggable ? (e) => { dragItem.current = ev; e.dataTransfer.effectAllowed = "move"; } : undefined}
                            onDragEnd={() => { dragItem.current = null; setOverKey(null); }}
                            onClick={(e) => { e.stopPropagation(); emitCalendarDetail(ev); }}
                            title={`${ev.title}${ev.projectName ? ` · ${ev.projectName}` : ""}${draggable ? " · arrastra a otro día para mover" : ""}`}
                            className={cn(
                              "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white transition-all hover:brightness-105",
                              draggable && "cursor-grab active:cursor-grabbing",
                            )}
                            style={{ background: t.solid }}
                          >
                            {ev.kind === "milestone" ? "" : ev.kind === "shoot" ? "🎬" : ev.kind === "task" ? "✅" : ev.time ? `${ev.time} ` : "📅 "}{ev.title}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded" style={{ background: calTone("event").solid }} /> Citas</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded" style={{ background: calTone("task").solid }} /> Tareas</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded" style={{ background: calTone("shoot").solid }} /> Rodajes</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded" style={{ background: calTone("milestone").solid }} /> Hitos de proyecto</span>
        {canCreate ? <span className="ml-auto">Toca un día para crear · arrastra una cita para moverla.</span> : null}
      </div>
    </div>
  );
}
