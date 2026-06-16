"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { emitCalendarCreate, emitCalendarDetail } from "./calendar-detail";

type Person = { name: string; initials: string | null; color: string | null };
export type TeamMember = { id: string; name: string; initials: string | null; color: string | null };

export type CalItem = {
  id: string;
  title: string;
  date: string; // ISO (inicio) — usado por la vista mensual
  kind: "event" | "task" | "shoot";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{MONTHS[month]} {year}</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={prev} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">←</button>
          <button type="button" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Hoy</button>
          <button type="button" onClick={next} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">→</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-muted/40 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">{w}</div>
        ))}
        {cells.map((d, i) => {
          const key = d ? `${year}-${pad(month + 1)}-${pad(d)}` : null;
          const evs = key ? byDay.get(key) ?? [] : [];
          const isToday = key === todayKey;
          return (
            <div
              key={i}
              onClick={() => { if (d && key && canCreate) emitCalendarCreate(key); }}
              className={cn("min-h-24 bg-card p-1.5", !d && "bg-muted/20", d && canCreate && "cursor-pointer hover:bg-muted/30")}
            >
              {d ? (
                <>
                  <div className={cn("mb-1 inline-flex size-5 items-center justify-center rounded-full text-[11px]", isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground")}>{d}</div>
                  <div className="space-y-1">
                    {evs.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); emitCalendarDetail(ev); }}
                        title={`${ev.title}${ev.projectName ? ` · ${ev.projectName}` : ""}`}
                        className={cn(
                          "block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px]",
                          ev.kind === "event" ? "bg-primary/15 text-foreground" : "bg-amber-500/15 text-foreground",
                        )}
                      >
                        {ev.kind === "event" ? "📅" : "✅"} {ev.time ? `${ev.time} ` : ""}{ev.title}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-primary/40" /> Eventos / reuniones</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-amber-500/40" /> Tareas con entrega</span>
        {canCreate ? <span className="ml-auto">Toca un día para crear una cita.</span> : null}
      </div>
    </div>
  );
}
