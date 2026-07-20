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

// Menú lateral VERTICAL del detalle de cliente (mismo lenguaje que el detalle de proyecto):
// grupos con título, íconos, badges de conteo y sticky en escritorio; en móvil se vuelve una
// fila horizontal con scroll. La vista activa persiste en localStorage y además se refleja en
// el hash de la URL (#ajustes) → se puede enlazar directo a una pestaña.
export function ClientViewNav({ groups, storageKey }: { groups: ClientViewGroup[]; storageKey?: string }) {
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

  // Soporta <a href="#ajustes"> desde la propia página (p. ej. el lápiz de la cabecera).
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

  const item = (v: ClientView, mobile: boolean) => {
    const on = v.key === current?.key;
    return (
      <button
        key={v.key}
        type="button"
        onClick={() => pick(v.key)}
        className={cn(
          "flex items-center gap-2 rounded-lg text-sm font-medium transition-colors",
          mobile ? "shrink-0 px-3 py-1.5" : "w-full px-2.5 py-1.5 text-left",
          on ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        {v.icon ? <span className="[&_svg]:size-4 [&_svg]:shrink-0">{v.icon}</span> : null}
        <span className={cn(!mobile && "min-w-0 flex-1 truncate")}>{v.label}</span>
        {v.badge ? (
          <span className={cn(
            "rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
            on ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}>
            {v.badge > 99 ? "99+" : v.badge}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      {/* Móvil: fila horizontal con scroll */}
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:hidden" aria-label="Secciones del cliente">
        {views.map((v) => item(v, true))}
      </nav>

      {/* Escritorio: menú vertical agrupado, fijo al hacer scroll */}
      <nav className="hidden shrink-0 md:sticky md:top-4 md:block md:w-44 md:self-start" aria-label="Secciones del cliente">
        {groups.map((g) => (
          <div key={g.label} className="mb-4">
            <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{g.label}</p>
            <div className="space-y-0.5">{g.views.map((v) => item(v, false))}</div>
          </div>
        ))}
      </nav>

      <div className="min-w-0 flex-1">{current?.node}</div>
    </div>
  );
}
