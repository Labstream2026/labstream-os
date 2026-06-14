"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { respondQuote } from "./actions";

// Botones de aprobar / rechazar para el cliente (vista pública).
export function QuoteDecision({ token }: { token: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => start(() => respondQuote(token, "APROBADA"))}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <Check className="size-4" /> Aprobar cotización
      </button>
      <button
        onClick={() => { if (confirm("¿Rechazar esta cotización?")) start(() => respondQuote(token, "RECHAZADA")); }}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
      >
        <X className="size-4" /> Rechazar
      </button>
    </div>
  );
}
