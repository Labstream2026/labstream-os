"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useOffline } from "@/lib/offline/sync";

// ── Barra global de «cambios pendientes de sincronizar» ──
// Complementa a SinConexion: esa dice que el servidor no responde; ESTA dice cuánto trabajo hay
// guardado en el equipo esperando volver. Nace del modo offline (Camino B, Fase 1): sin ella,
// «se guardó local y se enviará luego» sería invisible y el usuario no sabría que aún falta subir.
export function PendientesBar() {
  const { pendientes, estado } = useOffline();
  if (pendientes === 0 && estado !== "error") return null;

  return (
    <div
      role="status"
      className="mx-4 mb-1 mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 sm:mx-8"
    >
      {estado === "sincronizando" ? (
        <RefreshCw className="size-4 shrink-0 animate-spin text-amber-600" />
      ) : (
        <CloudOff className="size-4 shrink-0 text-amber-600" />
      )}
      <p className="min-w-48 flex-1 text-[12px] leading-relaxed">
        {estado === "sincronizando" ? (
          <>
            <b className="text-amber-700 dark:text-amber-400">Sincronizando…</b>{" "}
            <span className="text-muted-foreground">enviando lo que guardaste sin conexión.</span>
          </>
        ) : pendientes > 0 ? (
          <>
            <b className="text-amber-700 dark:text-amber-400">
              {pendientes} {pendientes === 1 ? "cambio" : "cambios"} sin sincronizar.
            </b>{" "}
            <span className="text-muted-foreground">
              Está a salvo en este equipo y se envía solo cuando vuelva el servidor.
            </span>
          </>
        ) : (
          <>
            <b className="text-destructive">Algo no se pudo sincronizar.</b>{" "}
            <span className="text-muted-foreground">Revisa tu sesión y vuelve a intentarlo.</span>
          </>
        )}
      </p>
    </div>
  );
}
