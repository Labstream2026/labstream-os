"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { MdHeading } from "@/lib/markdown";

// Índice de la página («en esta página»), con el apartado que estás leyendo resaltado.
// Los enlaces son anclas normales: funcionan aunque el JavaScript no cargue, y cada
// apartado se puede compartir por su URL (…/wiki/id#antes-de-salir).
export function WikiToc({ headings }: { headings: MdHeading[] }) {
  const [activo, setActivo] = React.useState<string | null>(headings[0]?.slug ?? null);

  React.useEffect(() => {
    if (!headings.length) return;
    const nodos = headings.map((h) => document.getElementById(h.slug)).filter((n): n is HTMLElement => !!n);
    if (!nodos.length) return;

    // Se marca el ÚLTIMO encabezado que ya pasó por la franja superior de la ventana.
    // Con `IntersectionObserver` a secas, al bajar rápido se quedaba marcado uno de más.
    const io = new IntersectionObserver(
      () => {
        const y = 120; // franja de lectura, bajo la barra superior
        let actual = nodos[0];
        for (const n of nodos) if (n.getBoundingClientRect().top <= y) actual = n;
        setActivo(actual.id);
      },
      { rootMargin: "-100px 0px -70% 0px", threshold: [0, 1] },
    );
    nodos.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [headings]);

  if (headings.length < 2) return null; // con un solo apartado el índice sobra

  return (
    <nav aria-label="Índice de la página" className="text-xs">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">En esta página</p>
      <ul className="space-y-0.5">
        {headings.map((h) => (
          <li key={h.slug}>
            <a
              href={`#${h.slug}`}
              onClick={() => setActivo(h.slug)}
              className={cn(
                "block border-l-2 py-1 pr-1 transition-colors",
                h.level >= 3 ? "pl-5" : "pl-3",
                activo === h.slug
                  ? "border-primary font-medium text-primary"
                  : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
              )}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
