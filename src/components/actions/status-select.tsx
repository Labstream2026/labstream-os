"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// Selector que dispara una server action al cambiar (estado/prioridad de tarea, etc.).
// La acción puede RECHAZAR (validación o permiso, p. ej. "solo quien asignó puede cambiar la
// prioridad"): antes ese throw subía al límite de error y tumbaba el panel a la pantalla gris.
// Ahora se atrapa, se marca en rojo y se re-sincroniza con el servidor (el <select> es controlado
// por `value`, así que vuelve solo al valor real).
export function StatusSelect({
  value,
  options,
  action,
  className,
}: {
  value: string;
  options: { value: string; label: string }[];
  action: (value: string) => Promise<unknown>;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [err, setErr] = useState(false);
  return (
    <select
      value={value}
      disabled={pending}
      title={err ? "No se pudo aplicar el cambio." : undefined}
      onChange={(e) => {
        const v = e.target.value;
        setErr(false);
        start(async () => {
          try {
            await action(v);
          } catch {
            setErr(true);
            router.refresh();
          }
        });
      }}
      className={cn(
        "cursor-pointer rounded-md border bg-card px-2 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-ring disabled:opacity-50",
        err ? "border-destructive ring-1 ring-destructive" : "border-border",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
