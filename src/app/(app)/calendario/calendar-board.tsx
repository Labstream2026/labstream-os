"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { MyCalendar, type CalItem } from "./my-calendar";
import { WeekView } from "./week-view";

// Conmutador de vistas del calendario del equipo: Semana (rejilla detallada por
// horas con panel de detalle) o Mes (rejilla mensual con creación de citas).
export function CalendarBoard({ items, onCreate }: { items: CalItem[]; onCreate?: (fd: FormData) => Promise<void> }) {
  const [view, setView] = React.useState<"semana" | "mes">("semana");
  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
        {(["semana", "mes"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors", view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {v === "semana" ? "🗓️ Semana" : "📅 Mes"}
          </button>
        ))}
      </div>
      {view === "semana" ? <WeekView items={items} /> : <MyCalendar items={items} onCreate={onCreate} />}
    </div>
  );
}
