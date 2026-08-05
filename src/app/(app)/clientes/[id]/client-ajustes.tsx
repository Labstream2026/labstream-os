"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ── Pestaña AJUSTES del cliente: índice + secciones ABIERTAS (rediseño aprobado por prototipo) ──
// Antes eran cuatro acordeones y aterrizabas en puros títulos cerrados: un clic para revelar la
// lista, otro clic para abrir cada uno. Ahora las cuatro secciones se ven de una y a la izquierda
// un índice para saltar. El índice resalta la sección visible (IntersectionObserver) y hace scroll
// suave — nada que desplegar. Cero acordeón.

export type AjSeccion = { id: string; titulo: string; desc: string; node: React.ReactNode };

export function AjustesLayout({ secciones, accentHex }: { secciones: AjSeccion[]; accentHex?: string }) {
  const [activa, setActiva] = React.useState(secciones[0]?.id);
  const refs = React.useRef<Record<string, HTMLElement | null>>({});

  React.useEffect(() => {
    const obs = new IntersectionObserver(
      (entradas) => {
        const visibles = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles[0]) setActiva(visibles[0].target.id);
      },
      // La sección "activa" es la que cruza la banda superior del panel (no la del medio): así el
      // índice se adelanta al scroll en vez de ir un paso por detrás.
      { rootMargin: "-8% 0px -72% 0px", threshold: 0 },
    );
    Object.values(refs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [secciones]);

  const ir = (id: string) => {
    setActiva(id);
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="grid gap-5 md:grid-cols-[152px_minmax(0,1fr)] md:items-start">
      <nav aria-label="Secciones de ajustes" className="flex gap-1 overflow-x-auto pb-1 md:sticky md:top-4 md:flex-col md:overflow-visible md:pb-0">
        {secciones.map((s) => {
          const on = s.id === activa;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => ir(s.id)}
              aria-current={on}
              style={on && accentHex ? { color: accentHex, background: `${accentHex}1f` } : undefined}
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors md:w-full",
                on ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {s.titulo}
            </button>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-col gap-4">
        {secciones.map((s) => (
          <section
            key={s.id}
            id={s.id}
            ref={(el) => { refs.current[s.id] = el; }}
            className="scroll-mt-4 rounded-xl border border-border bg-card p-4 sm:p-5"
          >
            <h4 className="text-sm font-semibold tracking-tight">{s.titulo}</h4>
            <p className="mb-4 mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
            {s.node}
          </section>
        ))}
      </div>
    </div>
  );
}
