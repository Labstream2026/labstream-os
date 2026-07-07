import * as React from "react";
import { cn } from "@/lib/utils";

// Encabezado de página consistente en toda la app: título grande + descripción opcional +
// acciones alineadas a la derecha (botones de "Nuevo …", etc.). Reemplaza los H1 hechos a mano
// con estilos disparejos por un único patrón. NO envuelve pestañas/filtros/buscadores: esos
// siguen debajo, en la propia página.
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
