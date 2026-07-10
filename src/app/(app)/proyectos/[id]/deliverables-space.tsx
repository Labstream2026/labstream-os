"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Espacio de entregables del proyecto: separa lo VIVO (en producción/revisión) del ARCHIVO
// de piezas ya aprobadas por el cliente, para que la ventana de trabajo no se llene de
// videos terminados. Mismo patrón de pestañas que TasksSpace. Siempre abre en «En curso».
export function DeliverablesSpace({
  activeCount,
  approvedCount,
  active,
  approved,
}: {
  activeCount: number;
  approvedCount: number;
  active: React.ReactNode;
  approved: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<"encurso" | "aprobados">("encurso");

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
      <div className="mb-4 flex items-center gap-2">
        {pill("encurso", "En curso", activeCount)}
        {pill("aprobados", "Aprobados", approvedCount)}
      </div>
      {tab === "encurso" ? active : approved}
    </div>
  );
}
