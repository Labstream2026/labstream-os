"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ── Pestaña AJUSTES del cliente: MAESTRO-DETALLE (rediseño aprobado por prototipo) ──
// Índice a la izquierda y SOLO el panel elegido a la derecha. La versión anterior pintaba las
// cuatro secciones abiertas en columna: quedaba el scroll largo que se pidió quitar. Ahora
// cambiar de sección es un clic y el contenido entra con el mismo fundido que las pestañas;
// en pantallas angostas el índice se vuelve una fila de chips desplazable.

export type AjSeccion = { id: string; titulo: string; desc: string; node: React.ReactNode };

export function AjustesLayout({ secciones, accentHex }: { secciones: AjSeccion[]; accentHex?: string }) {
  const [activa, setActiva] = React.useState(secciones[0]?.id);
  const actual = secciones.find((s) => s.id === activa) ?? secciones[0];

  return (
    <div className="grid gap-5 md:grid-cols-[168px_minmax(0,1fr)] md:items-start">
      <nav aria-label="Secciones de ajustes" className="flex gap-1 overflow-x-auto pb-1 md:sticky md:top-4 md:flex-col md:overflow-visible md:pb-0">
        {secciones.map((s) => {
          const on = s.id === actual?.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiva(s.id)}
              aria-current={on}
              style={on && accentHex ? { color: accentHex, background: `${accentHex}1f` } : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors md:w-full md:whitespace-normal",
                on ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {s.titulo}
            </button>
          );
        })}
      </nav>

      {actual ? (
        <section key={actual.id} className="min-w-0 rounded-xl border border-border bg-card p-4 animate-in fade-in slide-in-from-bottom-1 duration-200 sm:p-5">
          <h4 className="text-sm font-semibold tracking-tight">{actual.titulo}</h4>
          <p className="mb-4 mt-0.5 text-xs text-muted-foreground">{actual.desc}</p>
          {actual.node}
        </section>
      ) : null}
    </div>
  );
}
