"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ClientView = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  // Conteo que se pinta como pastilla a la derecha (entregables, archivos, por facturar…).
  badge?: number;
  node: React.ReactNode;
};

export type ClientViewGroup = { label: string; views: ClientView[] };

// Navegación del detalle de cliente: PESTAÑAS A LA VISTA (rediseño aprobado por prototipo).
// Antes era un botón «▾» que ESCONDÍA las ~10 secciones: no veías a dónde podías ir sin abrirlo.
// Ahora todas las secciones están en una fila; se salta con un clic y sin desplegar nada. El
// último grupo (Gestión: Actividad, Ajustes) se ancla a la derecha, separado de la producción.
// La pestaña activa persiste en localStorage y se refleja en el hash (#resumen) → se puede
// enlazar directo a una pestaña, y una sección puede mandar a otra con un simple <a href="#clave">.
export function ClientViewNav({
  groups,
  storageKey,
  accentHex,
}: {
  groups: ClientViewGroup[];
  storageKey?: string;
  // Color del cliente (hex): tiñe la pestaña activa y su subrayado. Sin él cae al acento de la app.
  accentHex?: string;
}) {
  const views = React.useMemo(() => groups.flatMap((g) => g.views), [groups]);
  const [active, setActive] = React.useState(views[0]?.key);

  // Preferencia tras montar (evita mismatch de hidratación). El hash manda sobre lo guardado.
  React.useEffect(() => {
    const fromHash = window.location.hash.replace(/^#/, "");
    if (fromHash && views.some((v) => v.key === fromHash)) { setActive(fromHash); return; }
    if (!storageKey) return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved && views.some((v) => v.key === saved)) setActive(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Soporta <a href="#clave"> desde la propia página (el lápiz de la cabecera, o «ver todos»
  // del Resumen que salta a la pestaña Proyectos sin una línea de plomería extra).
  React.useEffect(() => {
    const onHash = () => {
      const k = window.location.hash.replace(/^#/, "");
      if (k && views.some((v) => v.key === k)) setActive(k);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [views]);

  const pick = (key: string) => {
    setActive(key);
    if (storageKey) window.localStorage.setItem(storageKey, key);
    history.replaceState(null, "", `#${key}`);
  };

  const current = views.find((v) => v.key === active) ?? views[0];
  // Primera pestaña del ÚLTIMO grupo: se empuja a la derecha para separar «Gestión» del resto.
  const lastGroup = groups[groups.length - 1];
  const firstOfLast = groups.length > 1 ? lastGroup?.views[0]?.key : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Secciones del cliente" className="flex items-stretch gap-0.5 overflow-x-auto border-b border-border">
        {views.map((v) => {
          const on = v.key === current?.key;
          return (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(v.key)}
              style={on && accentHex ? { color: accentHex } : undefined}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors",
                v.key === firstOfLast && "ml-auto",
                on ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.icon ? <span className="[&_svg]:size-4 [&_svg]:shrink-0">{v.icon}</span> : null}
              <span>{v.label}</span>
              {v.badge ? (
                <span
                  style={on && accentHex ? { color: accentHex, background: `${accentHex}22` } : undefined}
                  className={cn(
                    "rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                    on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {v.badge > 99 ? "99+" : v.badge}
                </span>
              ) : null}
              {on ? (
                <span
                  aria-hidden
                  style={accentHex ? { background: accentHex } : undefined}
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* La sección entra con un fundido suave al cambiar de pestaña (mismo gesto que /ajustes). */}
      <div key={current?.key} className="min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-200">
        {current?.node}
      </div>
    </div>
  );
}
