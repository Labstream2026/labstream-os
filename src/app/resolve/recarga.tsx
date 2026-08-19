"use client";

import { useEffect } from "react";

// ── El panel se recarga SOLO cuando la app se actualizó debajo ──────────────
// Esta ventana vive DÍAS abierta dentro de Resolve (Electron) y nadie le da F5: tras cada
// deploy quedaba apuntando a acciones del build anterior y «✓ Hecha» fallaba para siempre
// («falló, reintenta» — pero reintentar no cura una página vieja). A diferencia de la app
// principal (donde un banner deja decidir), aquí lo correcto es recargar en silencio: el
// panel es un checklist sin estado que perder — salvo que se esté escribiendo en un campo,
// y en ese caso se espera y se reintenta en un rato.
//
// Tres gatillos: el sondeo periódico, volver a mostrarse la ventana (el momento crítico) y
// el evento ls:app-vieja que dispara ResolveToggle cuando un clic ya falló por versión.

const CADA_MS = 5 * 60_000;
const REINTENTO_MS = 30_000;

function escribiendo(): boolean {
  const el = document.activeElement;
  return (el instanceof HTMLInputElement && el.value.trim() !== "") || el instanceof HTMLTextAreaElement;
}

export function RecargaSiVieja({ versionPropia }: { versionPropia: string }) {
  useEffect(() => {
    let vivo = true;
    let programada = false;

    const recargar = () => {
      if (!vivo) return;
      if (escribiendo()) {
        // No se le arranca el texto a nadie: se vuelve a intentar en un rato.
        setTimeout(recargar, REINTENTO_MS);
        return;
      }
      window.location.reload();
    };
    const programarRecarga = () => {
      if (programada) return;
      programada = true;
      recargar();
    };

    const alFallar = () => programarRecarga();
    window.addEventListener("ls:app-vieja", alFallar);
    if (!versionPropia) {
      return () => window.removeEventListener("ls:app-vieja", alFallar); // dev: sin sello
    }

    const comprobar = async () => {
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { sha?: string };
        if (vivo && j.sha && j.sha !== versionPropia) programarRecarga();
      } catch {
        /* sin red no hay deploy que detectar */
      }
    };
    void comprobar();
    const timer = setInterval(comprobar, CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void comprobar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("ls:app-vieja", alFallar);
    };
  }, [versionPropia]);

  return null;
}
