"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
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

  // El menú se cierra al elegir. `open` es estado del DOM: React no lo toca al re-renderizar,
  // y DetailsAutoClose solo cierra con Escape, clic fuera o envío de formulario — estos son
  // botones, así que hay que cerrarlo a mano.
  const menuRef = React.useRef<HTMLDetailsElement>(null);

  const pick = (key: string) => {
    setActive(key);
    if (storageKey) window.localStorage.setItem(storageKey, key);
    history.replaceState(null, "", `#${key}`);
    if (menuRef.current) menuRef.current.open = false;
  };

  const current = views.find((v) => v.key === active) ?? views[0];

  const item = (v: ClientView) => {
    const on = v.key === current?.key;
    return (
      <button
        key={v.key}
        type="button"
        onClick={() => pick(v.key)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors",
          on ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted",
        )}
      >
        {v.icon ? <span className="[&_svg]:size-4 [&_svg]:shrink-0">{v.icon}</span> : null}
        <span className="min-w-0 flex-1 truncate">{v.label}</span>
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

  // SELECTOR DE SECCIÓN, no columna. Antes eran dos navegaciones: una barra vertical de 176 px
  // en escritorio —encima de la barra de la app, o sea dos columnas de menú seguidas— y una fila
  // con scroll en móvil. Ahora es un solo botón que dice DÓNDE estás; los mismos grupos, los
  // mismos conteos, a un clic. El contenido se queda con el ancho entero.
  return (
    <div className="flex flex-col gap-4">
      <details ref={menuRef} data-autoclose className="relative self-start">
        <summary
          className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent"
          aria-label={`Sección: ${current?.label ?? ""}. Cambiar de sección`}
        >
          {current?.icon ? <span className="[&_svg]:size-4 [&_svg]:shrink-0">{current.icon}</span> : null}
          {current?.label}
          {current?.badge ? (
            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold tabular-nums text-muted-foreground">
              {current.badge > 99 ? "99+" : current.badge}
            </span>
          ) : null}
          <ChevronDown className="size-4 text-muted-foreground" />
        </summary>
        <nav
          className="absolute left-0 z-40 mt-1 max-h-[70vh] w-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
          aria-label="Secciones del cliente"
        >
          {groups.map((g) => (
            <div key={g.label} className="mb-1 last:mb-0">
              <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{g.label}</p>
              <div className="space-y-0.5">{g.views.map(item)}</div>
            </div>
          ))}
        </nav>
      </details>

      <div className="min-w-0 flex-1">{current?.node}</div>
    </div>
  );
}
