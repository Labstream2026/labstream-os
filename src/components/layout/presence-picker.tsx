"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { setPresence } from "@/lib/notify-actions";

// Estados de disponibilidad que la persona fija a mano. El "No molestar" (dndUntil) es aparte y, si
// está vigente, prioriza: el punto se muestra rojo aunque el estado manual sea otro.
const OPTS = [
  { key: "activo", label: "Disponible", dot: "bg-emerald-500" },
  { key: "ocupado", label: "Ocupado", dot: "bg-amber-500" },
  { key: "ausente", label: "Ausente", dot: "bg-slate-400" },
] as const;

// Botón-punto en la barra: muestra tu estado y, al pulsarlo, despliega el selector. La actualización
// es optimista (el punto cambia al instante) y persiste con setPresence en segundo plano.
export function PresencePicker({ presence, dnd }: { presence?: string | null; dnd?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState<string>(presence || "activo");
  const [pending, startTransition] = React.useTransition();
  const ref = React.useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera o con Escape. (El setState vive en los handlers, no en el cuerpo del efecto.)
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (key: "activo" | "ocupado" | "ausente") => {
    setValue(key);
    setOpen(false);
    startTransition(async () => {
      await setPresence(key);
    });
  };

  const cur = OPTS.find((o) => o.key === value) ?? OPTS[0];
  const dotColor = dnd ? "bg-rose-500" : cur.dot;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={dnd ? "No molestar activo" : `Estado: ${cur.label}`}
        aria-label="Cambiar estado de disponibilidad"
        className="flex size-7 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
      >
        <span className={cn("size-2.5 rounded-full ring-2 ring-sidebar transition-colors", dotColor)} />
      </button>
      {open ? (
        <div className="absolute bottom-9 right-0 z-50 w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in zoom-in-95 duration-150">
          <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tu estado</p>
          {dnd ? <p className="px-2 pb-1 text-[11px] font-medium text-rose-500">🔕 No molestar activo</p> : null}
          {OPTS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => pick(o.key)}
              disabled={pending}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60",
                value === o.key && "font-medium",
              )}
            >
              <span className={cn("size-2.5 rounded-full", o.dot)} />
              {o.label}
              {value === o.key ? <span className="ml-auto text-primary">✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
