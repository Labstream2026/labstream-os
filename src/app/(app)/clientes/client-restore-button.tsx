"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Loader2 } from "lucide-react";
import { setClientActive } from "./actions";

// Botón «Restaurar» de la vista Archivo de clientes: reactiva el cliente ahí mismo
// (vuelve al menú, a la lista activa y al inicio) sin pasar por su ficha → Ajustes.
export function ClientRestoreButton({ clientId, compact = false }: { clientId: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const restore = () => {
    setError(null);
    start(async () => {
      const r = await setClientActive(clientId, true);
      if (r.ok) router.refresh();
      else setError(r.error ?? "No se pudo restaurar.");
    });
  };

  return (
    <span className="inline-flex flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={restore}
        disabled={pending}
        className={
          compact
            ? "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
            : "inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <ArchiveRestore className="size-4" />} Restaurar
      </button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
