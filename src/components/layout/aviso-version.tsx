"use client";

import * as React from "react";
import { RefreshCw, X } from "lucide-react";

// ── «La app se actualizó — recarga» ─────────────────────────────────────────
// Cada deploy deja OBSOLETAS las pestañas abiertas: su siguiente clic en cualquier acción
// falla con «Failed to find Server Action» (el error que el equipo veía al marcar «hecho»).
// Esta pestaña conoce el SHA con el que se pintó; aquí se compara contra el del servidor al
// volver a la pestaña (el momento crítico: pestañas que pasaron horas en segundo plano) y
// cada tanto — y si alguna acción ya falló por versión, el aviso se enciende al instante.

const CADA_MS = 5 * 60_000;

export function AvisoVersion({ versionPropia }: { versionPropia: string }) {
  const [visible, setVisible] = React.useState(false);
  const descartado = React.useRef(false);

  React.useEffect(() => {
    // Una acción acaba de fallar por versión vieja: esto ya no es un aviso, es la causa.
    const alFallar = () => { descartado.current = false; setVisible(true); };
    window.addEventListener("ls:app-vieja", alFallar);
    if (!versionPropia) return () => window.removeEventListener("ls:app-vieja", alFallar); // dev: sin sello

    let vivo = true;
    const comprobar = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { sha?: string };
        if (vivo && j.sha && j.sha !== versionPropia && !descartado.current) setVisible(true);
      } catch {
        /* sin red no hay deploy que detectar; SinConexion ya avisa lo suyo */
      }
    };
    // Al montar también: el service worker puede haber servido esta página de su caché de
    // navegación — vieja desde el primer segundo.
    void comprobar();
    const timer = setInterval(comprobar, CADA_MS);
    const alVolver = () => { if (document.visibilityState === "visible") void comprobar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("ls:app-vieja", alFallar);
    };
  }, [versionPropia]);

  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-[95] flex justify-center px-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-foreground px-4 py-2.5 text-[13px] text-background shadow-2xl">
        <span>🔄 La app se actualizó mientras esta pestaña estaba abierta — recárgala para seguir sin errores.</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 rounded-full bg-background/15 px-3 py-1 font-bold hover:bg-background/25"
        >
          <RefreshCw className="size-3.5" /> Recargar ahora
        </button>
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={() => { descartado.current = true; setVisible(false); }}
          className="rounded p-0.5 opacity-60 hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
