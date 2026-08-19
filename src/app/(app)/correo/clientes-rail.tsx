"use client";

import * as React from "react";
import Link from "next/link";
import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Los clientes del raíl, con ANCLA ────────────────────────────────────────
// El pin (aparece al pasar el ratón) sube ese cliente al principio, siempre. Preferencia del
// navegador (localStorage): personal y cosmética.

export type ClienteRailVM = { id: string; nombre: string; hex: string; noLeidos: number };
const CLAVE = "correo:clientesFijos";

export function ClientesRail({ clientes, activo }: { clientes: ClienteRailVM[]; activo: string | null }) {
  const [fijos, setFijos] = React.useState<string[]>([]);
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLAVE);
      if (raw) setFijos((JSON.parse(raw) as string[]).filter((x) => typeof x === "string"));
    } catch { /* al defecto */ }
  }, []);

  const alterna = (id: string) => {
    setFijos((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { window.localStorage.setItem(CLAVE, JSON.stringify(next)); } catch { /* se pierde al recargar */ }
      return next;
    });
  };

  if (!clientes.length) return null;
  const orden = [...clientes].sort((a, b) => Number(fijos.includes(b.id)) - Number(fijos.includes(a.id)));

  return (
    <>
      <p className="mt-3 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Clientes</p>
      {orden.map((c) => {
        const fijo = fijos.includes(c.id);
        return (
          <span key={c.id} className="group/cl relative">
            <Link href={`/correo?c=cliente:${c.id}`} prefetch={false}
              className={cn("flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[13px]", activo === c.id ? "bg-primary/10 font-bold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: c.hex }} />
              <span className="truncate">{c.nombre}</span>
              {c.noLeidos > 0 ? <b className="ml-auto text-[11.5px] tabular-nums group-hover/cl:invisible">{c.noLeidos}</b> : null}
            </Link>
            <button
              type="button"
              title={fijo ? "Soltar de arriba" : "Anclar arriba"}
              onClick={() => alterna(c.id)}
              className={cn(
                "absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1",
                fijo ? "text-primary" : "invisible text-muted-foreground hover:text-foreground group-hover/cl:visible",
              )}
            >
              <Pin className="size-3" fill={fijo ? "currentColor" : "none"} />
            </button>
          </span>
        );
      })}
    </>
  );
}
