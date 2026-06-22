"use client";

import { useEffect, useState } from "react";
import { CalendarDays, GanttChartSquare } from "lucide-react";
import { cn } from "@/lib/utils";

// Conmutador interno de la pestaña "Calendario": Vista Calendario ↔ Vista Cronograma.
// Los nodos se renderizan en el servidor y se pasan como props (mismo patrón que ViewTabs),
// pero aquí el contenedor da ALTURA COMPLETA al calendario (rejilla con scroll propio) y
// deja que el cronograma haga su propio scroll.
const KEY = "calendario-vista";

export function CalendarTimelineTabs({
  calendarNode,
  timelineNode,
}: {
  calendarNode: React.ReactNode;
  timelineNode: React.ReactNode | null;
}) {
  const [view, setView] = useState<"cal" | "crono">("cal");

  useEffect(() => {
    if (!timelineNode) return;
    if (window.localStorage.getItem(KEY) === "crono") setView("crono");
  }, [timelineNode]);

  const pick = (v: "cal" | "crono") => {
    setView(v);
    window.localStorage.setItem(KEY, v);
  };

  const tab = (v: "cal" | "crono", label: string, Icon: typeof CalendarDays) => (
    <button
      type="button"
      onClick={() => pick(v)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" /> {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 inline-flex w-fit shrink-0 items-center gap-1 rounded-lg bg-muted p-1">
        {tab("cal", "Calendario", CalendarDays)}
        {timelineNode ? tab("crono", "Cronograma", GanttChartSquare) : null}
      </div>
      <div className="min-h-0 flex-1">
        {view === "crono" && timelineNode ? (
          <div className="h-full overflow-auto">{timelineNode}</div>
        ) : (
          <div className="h-full">{calendarNode}</div>
        )}
      </div>
    </div>
  );
}
