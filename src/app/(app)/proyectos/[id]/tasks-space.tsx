"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { QuickAdd } from "@/app/(app)/mis-tareas/quick-add";

// Espacio de tareas del proyecto: separa lo VIVO de lo ya hecho para que el tablero y la
// lista no se llenen de tareas terminadas. Dos sub-pestañas con contador; las completadas
// tienen su propia vista (historial compacto + reabrir). Siempre abre en Pendientes.
export function TasksSpace({
  projectId,
  pendingCount,
  completedCount,
  pending,
  completed,
}: {
  projectId?: string; // con proyecto: quick-add en lenguaje natural arriba de las pestañas
  pendingCount: number;
  completedCount: number;
  pending: React.ReactNode;
  completed: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<"pendientes" | "completadas">("pendientes");

  const pill = (key: typeof tab, label: string, count: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
        tab === key ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label} · {count}
    </button>
  );

  return (
    <div>
      {projectId ? (
        <div className="mb-3">
          <QuickAdd projectId={projectId} placeholder="Nueva tarea del proyecto… «Storyboard mañana @Diana #guion 3h» y Enter" />
        </div>
      ) : null}
      <div className="mb-4 flex items-center gap-2">
        {pill("pendientes", "Pendientes", pendingCount)}
        {pill("completadas", "Completadas", completedCount)}
      </div>
      {tab === "pendientes" ? pending : completed}
    </div>
  );
}
