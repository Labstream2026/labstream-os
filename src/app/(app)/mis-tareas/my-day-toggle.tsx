"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleMyDay } from "./actions";

// Botón ⭐ para añadir/quitar una tarea de "Mi día" (enfoque personal de hoy). Optimista:
// alterna al instante y confirma con el servidor (que también revalida la página para mover
// la tarea entre pestañas).
export function MyDayToggle({ taskId, initial }: { taskId: string; initial: boolean }) {
  const [on, setOn] = React.useState(initial);
  const [, start] = React.useTransition();
  React.useEffect(() => { setOn(initial); }, [initial]);
  return (
    <button
      type="button"
      title={on ? "Quitar de Mi día" : "Añadir a Mi día"}
      aria-label={on ? "Quitar de Mi día" : "Añadir a Mi día"}
      aria-pressed={on}
      onClick={() => {
        setOn((v) => !v);
        start(async () => {
          const r = await toggleMyDay(taskId);
          if (r && typeof r.inMyDay === "boolean") setOn(r.inMyDay);
        });
      }}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors",
        on ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground/50 hover:bg-accent hover:text-foreground",
      )}
    >
      <Star className={cn("size-4", on && "fill-amber-500")} />
    </button>
  );
}
