"use client";

import * as React from "react";
import { HardDrive, Loader2 } from "lucide-react";
import { setBackupLock } from "./biblioteca-actions";

// Ajustes → Biblioteca: el candado de respaldo. Con el candado puesto, un proyecto
// cuyo material no tenga respaldo registrado en el mapa NO se puede marcar Terminado.
export function BibliotecaSettings({ initialLock }: { initialLock: boolean }) {
  const [on, setOn] = React.useState(initialLock);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const toggle = () => {
    const next = !on;
    setError(null);
    startTransition(async () => {
      const r = await setBackupLock(next);
      if (r.ok) setOn(next);
      else setError(r.error ?? "No se pudo guardar.");
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <HardDrive className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Candado de respaldo al terminar</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Con el candado puesto, un proyecto sin respaldo registrado en el <b>mapa del material</b> no
            se puede marcar como Terminado (se valida en el servidor). El modal de cierre ofrece
            registrar el respaldo ahí mismo.
          </p>
          {error ? <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p> : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={toggle}
          disabled={pending}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"} disabled:opacity-60`}
          title={on ? "Candado activo" : "Candado apagado"}
        >
          {pending ? (
            <Loader2 className="absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-white" />
          ) : (
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
          )}
        </button>
      </div>
    </div>
  );
}
