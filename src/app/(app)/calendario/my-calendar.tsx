"use client";

import { useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";

export type CalItem = {
  id: string;
  title: string;
  date: string; // ISO
  kind: "event" | "task";
  time?: string | null; // "HH:mm" para eventos
  projectName?: string | null;
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
  onCreate,
}: {
  items: CalItem[];
  onCreate?: (fd: FormData) => Promise<void>;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
              onClick={() => { if (d && key && onCreate) setOpenDay(key); }}
              className={cn("min-h-24 bg-card p-1.5", !d && "bg-muted/20", d && onCreate && "cursor-pointer hover:bg-muted/30")}
            >
              {d ? (
                <>
                  <div className={cn("mb-1 inline-flex size-5 items-center justify-center rounded-full text-[11px]", isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground")}>{d}</div>
                  <div className="space-y-1">
                    {evs.map((ev) => (
                      <div
                        key={ev.id}
                        title={`${ev.title}${ev.projectName ? ` · ${ev.projectName}` : ""}`}
                        className={cn(
                          "truncate rounded px-1.5 py-0.5 text-[11px]",
                          ev.kind === "event" ? "bg-primary/15 text-foreground" : "bg-amber-500/15 text-foreground",
                        )}
                      >
                        {ev.kind === "event" ? "📅" : "✅"} {ev.time ? `${ev.time} ` : ""}{ev.title}
                      </div>
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
        {onCreate ? <span className="ml-auto">Toca un día para crear una cita.</span> : null}
      </div>

      {/* Crear cita al tocar un día */}
      {openDay && onCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpenDay(null)}>
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold">Nueva cita</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Date(`${openDay}T00:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                fd.set("date", openDay);
                start(() => onCreate(fd).then(() => setOpenDay(null)));
              }}
              className="mt-3 space-y-2"
            >
              <input name="title" required autoFocus placeholder="Título de la cita" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <div className="flex items-center gap-2">
                <input name="time" type="time" className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
                <span className="text-xs text-muted-foreground">(vacío = todo el día)</span>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpenDay(null)} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
                <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{pending ? "Creando…" : "Crear"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
