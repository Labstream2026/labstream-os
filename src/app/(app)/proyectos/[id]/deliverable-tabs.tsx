"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Pestañas del entregable desplegado (Correcciones / Contenido / Enlace y ajustes).
// El contenido llega como ReactNode desde el server component (deliverables-panel):
// así los formularios con server actions ya vienen renderizados y este componente
// solo gestiona cuál pestaña se ve.
export function DeliverableTabs({
  tabs,
  defaultKey,
}: {
  tabs: { key: string; label: string; badge?: number; content: React.ReactNode }[];
  defaultKey?: string;
}) {
  const [active, setActive] = React.useState(defaultKey ?? tabs[0]?.key);
  return (
    <div>
      <div role="tablist" className="flex items-center gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={cn(
                "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {/* Badge ámbar: correcciones PENDIENTES (lo urgente, no el total). */}
              {t.badge ? (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {/* Los TRES paneles quedan SIEMPRE montados y se ocultan con `hidden`: si se
          desmontaran al cambiar de pestaña, los formularios (archivo elegido, notas
          a medio escribir) perderían su estado. */}
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" hidden={t.key !== active} className="pt-3">
          {t.content}
        </div>
      ))}
    </div>
  );
}
