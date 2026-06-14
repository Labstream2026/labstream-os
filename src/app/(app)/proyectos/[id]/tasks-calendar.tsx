"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { PRIORITY } from "@/lib/ui";
import type { Task } from "./task-shared";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Clave de día local "YYYY-MM-DD" de una fecha de rodaje (anclada a mediodía UTC).
function dayKey(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// Vista Calendario: rejilla mensual con los rodajes (tareas con fecha de rodaje).
export function TasksCalendar({ tasks }: { tasks: Task[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-11

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const k = dayKey(t.shootDate);
      if (!k) continue;
      (map.get(k) ?? map.set(k, []).get(k)!).push(t);
    }
    return map;
  }, [tasks]);

  const withoutDate = tasks.filter((t) => !t.shootDate);

  // Construir la rejilla: empieza el lunes de la semana del día 1.
  const first = new Date(Date.UTC(year, month, 1));
  const startOffset = (first.getUTCDay() + 6) % 7; // 0 = lunes
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // "Hoy" en fecha local (los números de día de la rejilla son locales).
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const prev = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  };
  const next = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {MONTHS[month]} {year}
        </h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={prev} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">
            ←
          </button>
          <button
            type="button"
            onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            Hoy
          </button>
          <button type="button" onClick={next} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-muted/40 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          const key = d ? `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
          const dayTasks = key ? byDay.get(key) ?? [] : [];
          const isToday = key && key === todayKey;
          return (
            <div
              key={i}
              className={cn(
                "min-h-24 bg-card p-1.5 align-top",
                !d && "bg-muted/20",
              )}
            >
              {d ? (
                <>
                  <div className={cn(
                    "mb-1 inline-flex size-5 items-center justify-center rounded-full text-[11px]",
                    isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground",
                  )}>
                    {d}
                  </div>
                  <div className="space-y-1">
                    {dayTasks.map((t) => {
                      const prio = PRIORITY[t.priority] ?? PRIORITY.MEDIA;
                      return (
                        <div
                          key={t.id}
                          title={`${t.title} · ${prio.label}`}
                          className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-foreground"
                        >
                          🎬 {t.title}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {withoutDate.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {withoutDate.length} tarea{withoutDate.length === 1 ? "" : "s"} sin fecha de rodaje. Asígnala desde el tablero o la lista para verla aquí.
        </p>
      ) : null}
    </div>
  );
}
