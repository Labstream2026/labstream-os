"use client";

import * as React from "react";
import { CloudOff } from "lucide-react";

// ── Barra de «sin servidor» ──
// El service worker permite CONSULTAR lo último que se vio cuando el NAS no responde. Esta
// barra existe para que eso no se confunda con poder trabajar: guardar necesita el servidor,
// y alguien escribiendo un brief durante una caída, creyendo que se guarda, perdería el rato
// entero. Un modo offline mudo sería peor que no tener modo offline.
//
// No se fía de `navigator.onLine`: eso solo dice si hay tarjeta de red conectada, y el caso
// típico aquí es justo el contrario —internet perfecto y el NAS caído—. La verdad se pregunta
// al servidor. Mientras todo va bien NO se pregunta nada (sería gastar los datos que estamos
// tratando de ahorrar): solo al volver a la ventana, al recuperar red, y en bucle mientras
// se sabe que está caído, para poder avisar en cuanto vuelva.

const CADA = 15000;

export function SinConexion() {
  const [caido, setCaido] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;

    const comprobar = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(6000) });
        if (vivo) setCaido(!r.ok);
      } catch {
        if (vivo) setCaido(true);
      }
    };

    const alPerder = () => setCaido(true);
    const alVolver = () => void comprobar();
    const alMirar = () => { if (document.visibilityState === "visible") void comprobar(); };

    window.addEventListener("offline", alPerder);
    window.addEventListener("online", alVolver);
    document.addEventListener("visibilitychange", alMirar);
    if (!navigator.onLine) setCaido(true);

    return () => {
      vivo = false;
      window.removeEventListener("offline", alPerder);
      window.removeEventListener("online", alVolver);
      document.removeEventListener("visibilitychange", alMirar);
    };
  }, []);

  // Mientras esté caído, se pregunta cada 15 s para quitar la barra en cuanto vuelva.
  React.useEffect(() => {
    if (!caido) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(6000) });
        if (r.ok) setCaido(false);
      } catch {
        /* sigue caído */
      }
    }, CADA);
    return () => clearInterval(t);
  }, [caido]);

  if (!caido) return null;

  return (
    <div
      role="status"
      className="mx-4 mb-1 mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 sm:mx-8"
    >
      <CloudOff className="size-4 shrink-0 text-destructive" />
      <p className="min-w-48 flex-1 text-[12px] leading-relaxed">
        <b className="text-destructive">Sin conexión con el servidor.</b>{" "}
        <span className="text-muted-foreground">
          Puedes consultar lo último que viste y <b className="text-foreground">seguir escribiendo notas</b> —se guardan en este
          equipo y se sincronizan al volver—. Otras acciones esperan al servidor; se reconecta solo.
        </span>
      </p>
    </div>
  );
}
