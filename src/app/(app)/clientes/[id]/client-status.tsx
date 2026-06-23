"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Power, PowerOff, Trash2 } from "lucide-react";
import { setClientActive, archiveClient } from "../actions";

// Estado del cliente (Ajustes): activar/desactivar para ocultarlo de las listas sin perder
// nada, y "mover a papelera" (archivar) como borrado suave reversible. El borrado definitivo
// vive en la Papelera.
export function ClientStatus({
  clientId,
  isActive,
  canArchive,
}: {
  clientId: string;
  isActive: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  function toggle() {
    setMsg(null);
    start(async () => {
      const r = await setClientActive(clientId, !isActive);
      if (r.ok) {
        setMsg({ ok: true, text: isActive ? "Cliente desactivado." : "Cliente reactivado." });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error ?? "No se pudo cambiar el estado." });
      }
    });
  }

  function archive() {
    if (!window.confirm("¿Mover este cliente a la papelera? Sale de las listas pero se conserva todo y se puede restaurar.")) return;
    setMsg(null);
    start(async () => {
      const r = await archiveClient(clientId);
      if (r.ok) {
        router.push("/clientes");
      } else {
        setMsg({ ok: false, text: r.error ?? "No se pudo archivar." });
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Estado del cliente</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isActive
              ? "Activo: aparece en el menú, la lista de clientes y el inicio."
              : "Inactivo: oculto de las listas. Reactívalo cuando llegue un proyecto nuevo."}
          </p>
        </div>
        <span
          className={
            isActive
              ? "shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
          }
        >
          {isActive ? "Activo" : "Inactivo"}
        </span>
      </div>

      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
      >
        {isActive ? <PowerOff className="size-4" /> : <Power className="size-4" />}
        {pending ? "Guardando…" : isActive ? "Desactivar cliente" : "Reactivar cliente"}
      </button>

      {canArchive ? (
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={archive}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="size-4" /> Mover a papelera
          </button>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Borrado suave: se conserva todo y se puede restaurar desde la Papelera.
          </p>
        </div>
      ) : null}

      {msg ? (
        <span className={msg.ok ? "inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-destructive"}>
          {msg.ok ? <Check className="size-3.5" /> : null}
          {msg.text}
        </span>
      ) : null}
    </div>
  );
}
