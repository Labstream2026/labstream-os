"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useTopbarSlot } from "@/components/layout/topbar-slot";

// Identidad de página EN LA BARRA SUPERIOR: este componente ya no pinta un H1 grande dentro
// de la página — teletransporta título + descripción + ícono al hueco `#topbar-page-slot`
// de la Topbar (portal tras montar, igual que el detalle de proyecto). El default de la barra
// (nav-meta) se oculta solo vía CSS cuando este contenido aparece. En la página solo quedan
// las ACCIONES ("Nuevo …"), alineadas a la derecha. Las ~12 páginas que ya usaban PageHeader
// migran sin tocarse: misma firma, nuevo destino.
export function PageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: {
  title: string;
  description?: string;
  // Ícono de la sección (set propio de Labstream): burbuja suave a la izquierda del título.
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const target = useTopbarSlot("topbar-page-slot");

  return (
    <>
      {target
        ? createPortal(
            <div className="flex min-w-0 items-center gap-2.5">
              {icon ? (
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&>svg]:size-5">
                  {icon}
                </span>
              ) : null}
              <span className="min-w-0">
                <span className="block truncate text-[14.5px] font-semibold leading-tight">{title}</span>
                {description ? (
                  <span className="hidden truncate text-[11.5px] leading-tight text-muted-foreground sm:block">{description}</span>
                ) : null}
              </span>
            </div>,
            target,
          )
        : null}
      {actions ? <div className={cn("mb-4 flex flex-wrap items-center justify-end gap-2", className)}>{actions}</div> : null}
    </>
  );
}
