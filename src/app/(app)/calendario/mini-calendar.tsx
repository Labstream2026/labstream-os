"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function sameDay(a: Date, y: number, m: number, d: number): boolean {
  return a.getFullYear() === y && a.getMonth() === m && a.getDate() === d;
}

export function MiniCalendar({ anchor, onSelect, markers, className }: {
  anchor: Date;                 // día/mes enfocado (controlado por el padre)
  onSelect: (d: Date) => void;  // clic en un día -> nueva fecha ancla (Date local)
  markers?: Set<string>;        // claves "YYYY-MM-DD" de días que tienen eventos -> punto debajo del número
  className?: string;
}) {
  const [viewMonth, setViewMonth] = React.useState<Date>(
    () => new Date(anchor.getFullYear(), anchor.getMonth(), 1),
  );

  React.useEffect(() => {
    setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  }, [anchor.getFullYear(), anchor.getMonth()]);

  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const startOffset = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date();

  const cells: Array<number | null> = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className={cn("select-none", className)}>
      <div className="flex justify-between items-center mb-1">
        <button
          type="button"
          onClick={() => setViewMonth(new Date(y, m - 1, 1))}
          className="size-6 rounded-md text-muted-foreground hover:bg-muted"
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <span className="text-sm font-medium">{MONTHS[m]} {y}</span>
        <button
          type="button"
          onClick={() => setViewMonth(new Date(y, m + 1, 1))}
          className="size-6 rounded-md text-muted-foreground hover:bg-muted"
          aria-label="Mes siguiente"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="size-7 text-[10px] text-muted-foreground flex items-center justify-center">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="size-7" />;
          const key = `${y}-${pad(m + 1)}-${pad(d)}`;
          const isToday = sameDay(today, y, m, d);
          const isSelected = !isToday && sameDay(anchor, y, m, d);
          const hasMarker = !isToday && !isSelected && !!markers?.has(key);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(new Date(y, m, d))}
              className={cn(
                "relative size-7 text-xs rounded-md flex items-center justify-center",
                isToday && "bg-rose-500 text-white",
                isSelected && "bg-primary text-primary-foreground",
                !isToday && !isSelected && "hover:bg-muted",
              )}
            >
              {d}
              {hasMarker && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 size-[1.5px] rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
