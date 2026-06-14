"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { type LabelRow, labelMeta } from "@/lib/colors";

type Item = { id: string; title: string; dueDate: string | null; priority: string; projectName: string | null };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function dayKey(d: string | null): string | null {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// Calendario mensual de tareas por su fecha de ENTREGA (dueDate).
export function DueCalendar({ items, priorities }: { items: Item[]; priorities: LabelRow[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const t of items) {
      const k = dayKey(t.dueDate);
      if (!k) continue;
      (map.get(k) ?? map.set(k, []).get(k)!).push(t);
    }
    return map;
  }, [items]);

  const noDate = items.filter((t) => !t.dueDate).length;
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
          const dayItems = key ? byDay.get(key) ?? [] : [];
          const isToday = key === todayKey;
          return (
            <div key={i} className={cn("min-h-24 bg-card p-1.5", !d && "bg-muted/20")}>
              {d ? (
                <>
                  <div className={cn("mb-1 inline-flex size-5 items-center justify-center rounded-full text-[11px]", isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground")}>{d}</div>
                  <div className="space-y-1">
                    {dayItems.map((t) => {
                      const prio = labelMeta(priorities, t.priority);
                      return (
                        <div key={t.id} title={`${t.title}${t.projectName ? ` · ${t.projectName}` : ""}`} className={cn("truncate rounded px-1.5 py-0.5 text-[11px]", prio.chip)}>
                          {t.title}
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

      {noDate > 0 ? (
        <p className="text-xs text-muted-foreground">{noDate} tarea{noDate === 1 ? "" : "s"} sin fecha de entrega.</p>
      ) : null}
    </div>
  );
}
