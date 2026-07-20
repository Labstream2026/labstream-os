"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { setClientActive, archiveClient } from "../actions";

// Estado del cliente (Ajustes): un interruptor Activo/Inactivo (el estado se ve y se cambia
// en el mismo control) y una ZONA DE PELIGRO separada con «Mover a papelera» que confirma
// en dos pasos dentro del propio panel (sin el confirm feo del navegador).
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
  const [confirming, setConfirming] = React.useState(false);

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
    setConfirming(false);
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
      <h3 className="text-sm font-semibold">Estado del cliente</h3>

      {/* Interruptor Activo/Inactivo */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{isActive ? "Activo" : "Inactivo"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isActive
              ? "Aparece en el menú, la lista de clientes y el inicio."
              : "Oculto de las listas. Reactívalo cuando llegue un proyecto nuevo."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          aria-label={isActive ? "Desactivar cliente" : "Reactivar cliente"}
          onClick={toggle}
          disabled={pending}
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
            isActive ? "bg-emerald-500" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all",
              isActive ? "left-[calc(100%-1.375rem)]" : "left-0.5",
            )}
          />
        </button>
      </div>

      {msg ? (
        <span className={msg.ok ? "inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400" : "text-xs text-destructive"}>
          {msg.ok ? <Check className="size-3.5" /> : null}
          {msg.text}
        </span>
      ) : null}

      {/* Zona de peligro */}
      {canArchive ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive/80">Zona de peligro</p>
          {confirming ? (
            <div className="mt-2">
              <p className="text-sm">¿Mover <strong>este cliente</strong> a la papelera?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Sale de las listas pero se conserva todo (proyectos, archivos, facturas) y se puede restaurar desde la Papelera.</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={archive}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Sí, mover a papelera
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="size-4" /> Mover a papelera
              </button>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Borrado suave: se conserva todo y se puede restaurar desde la Papelera.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
