"use client";

import { useEffect } from "react";
import { esNoAutorizado } from "@/lib/authz-error";

// Pantalla de error PROPIA del panel de correcciones. Sin esto, un fallo de consulta mostraba
// el error crudo de Next dentro de la ventanita de Resolve —sin barra de direcciones, sin
// devtools y sin forma de volver—, que parecía que el plugin se había roto.
// Estilo oscuro del panel, motivo en cristiano y dos salidas: reintentar o volver a proyectos.
export default function ResolveError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[panel correcciones]", error);
  }, [error]);

  const permiso = esNoAutorizado(error);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center">
      <p className="text-2xl" aria-hidden>{permiso ? "🔒" : "⚠️"}</p>
      <h1 className="text-sm font-semibold text-zinc-100">
        {permiso ? "Esta acción no está permitida" : "No se pudo cargar el panel"}
      </h1>
      <p className="max-w-xs text-[13px] leading-relaxed text-zinc-400">
        {permiso
          ? "Tu usuario no tiene acceso a este proyecto. Pídele al responsable que te sume al equipo."
          : "Puede ser la conexión con el servidor o un problema momentáneo. Tu trabajo en Resolve no se ve afectado."}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <button
          onClick={reset}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          Reintentar
        </button>
        <a
          href="/resolve"
          className="rounded border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
        >
          Volver a proyectos
        </a>
      </div>
      {error.digest ? <p className="mt-1 font-mono text-[10px] text-zinc-600">Ref: {error.digest}</p> : null}
    </div>
  );
}
