"use client";

import * as React from "react";
import { requestDeliveryReactivation } from "./actions";

// Botón de la página de entrega VENCIDA: un clic y el equipo recibe la campana. Sin cuenta,
// sin formularios — el enlace firmado ya identifica el proyecto.
export function ReactivateButton({ token }: { token: string }) {
  const [pending, startTransition] = React.useTransition();
  const [state, setState] = React.useState<"idle" | "done" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);

  if (state === "done") {
    return (
      <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400">
        ✓ Listo — avisamos al equipo. Cuando reactiven la entrega, este mismo enlace volverá a funcionar.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await requestDeliveryReactivation(token);
            if (r.ok) setState("done");
            else {
              setState("error");
              setError(r.error ?? "No se pudo enviar la solicitud.");
            }
          })
        }
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Solicitar reactivación"}
      </button>
      {state === "error" && error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
