"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { respondQuote } from "./actions";

// Botones de aprobar / rechazar para el cliente (vista pública).
export function QuoteDecision({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  // Responde sin tumbar la página pública: startTransition no atrapa los rechazos, así que
  // envolvemos en try/catch (p. ej. enlace caducado, cotización vencida o acción obsoleta
  // tras un deploy) y mostramos el motivo al cliente.
  const respond = (decision: "APROBADA" | "RECHAZADA") =>
    start(async () => {
      try { setErr(null); await respondQuote(token, decision); }
      catch (e) { setErr(e instanceof Error ? e.message : "No pudimos registrar tu respuesta. Recarga la página e inténtalo de nuevo."); }
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => respond("APROBADA")}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Check className="size-4" /> Aprobar cotización
        </button>
        <button
          onClick={() => { if (confirm("¿Rechazar esta cotización?")) respond("RECHAZADA"); }}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
        >
          <X className="size-4" /> Rechazar
        </button>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </div>
  );
}
