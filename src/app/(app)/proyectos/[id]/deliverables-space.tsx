"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Espacio de entregables del proyecto: separa lo VIVO (en producción/revisión) del ARCHIVO
// de piezas ya aprobadas por el cliente, para que la ventana de trabajo no se llene de
// videos terminados. Mismo patrón de pestañas que TasksSpace. Siempre abre en «En curso».
// «Portadas» y «Fotos» son entregas APARTE de los videos: el banco de portadas vinculables
// y los sets de fotos con calificación del cliente.
export function DeliverablesSpace({
  activeCount,
  approvedCount,
  coversCount,
  photosCount,
  active,
  approved,
  covers,
  photos,
}: {
  activeCount: number;
  approvedCount: number;
  coversCount?: number;
  photosCount?: number;
  active: React.ReactNode;
  approved: React.ReactNode;
  covers?: React.ReactNode;
  photos?: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<"encurso" | "aprobados" | "portadas" | "fotos">("encurso");

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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {pill("encurso", "En curso", activeCount)}
        {pill("aprobados", "Aprobados", approvedCount)}
        {covers ? pill("portadas", "🖼️ Portadas", coversCount ?? 0) : null}
        {photos ? pill("fotos", "📷 Fotos", photosCount ?? 0) : null}
      </div>
      {tab === "encurso" ? active : tab === "aprobados" ? approved : tab === "portadas" ? covers : photos}
    </div>
  );
}
