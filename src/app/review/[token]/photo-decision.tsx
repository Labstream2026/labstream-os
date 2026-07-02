"use client";

import * as React from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { setReviewDecision } from "./actions";

// Decisión del cliente para las galerías de FOTOGRAFIA: cuando termina su selección, aprueba
// el entregable o pide cambios (con nota opcional). Es el mismo setReviewDecision del resto de
// piezas (para fotos no exige versión aprobada, basta con que haya fotos).
export function PhotoDecision({ token, status, sessionName }: { token: string; status: string; sessionName: string | null }) {
  const decidable = status === "ENVIADO_CLIENTE" || status === "CORRECCIONES";
  const [done, setDone] = React.useState<null | "APROBADO" | "CORRECCIONES">(
    status === "APROBADO" || status === "ENTREGADO" ? "APROBADO" : null,
  );
  const [asking, setAsking] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const decide = (decision: "APROBADO" | "CORRECCIONES") => {
    setError(null);
    start(async () => {
      try {
        await setReviewDecision(token, decision, sessionName ?? "Cliente", decision === "CORRECCIONES" ? note : undefined);
        setDone(decision);
        setAsking(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos registrar tu decisión. Inténtalo de nuevo.");
      }
    });
  };

  if (done === "APROBADO") {
    return (
      <section className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <span>Selección aprobada. El equipo preparará las fotos finales.</span>
      </section>
    );
  }
  if (done === "CORRECCIONES") {
    return (
      <section className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        ✏️ Enviamos tus ajustes al equipo. Te avisarán cuando la selección esté actualizada.
      </section>
    );
  }
  if (!decidable) return null;

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">¿Terminaste tu selección?</h2>
        <p className="text-xs text-muted-foreground">Cuando hayas marcado tus fotos, aprueba la selección o pide cambios.</p>
      </div>
      <div className="space-y-3 p-4">
        {asking ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="¿Qué cambios necesitas en las fotos? (opcional)"
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => decide("CORRECCIONES")} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {pending ? <Loader2 className="size-4 animate-spin" /> : null} Enviar cambios
              </button>
              <button type="button" onClick={() => setAsking(false)} disabled={pending} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => decide("APROBADO")} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Aprobar selección
            </button>
            <button type="button" onClick={() => setAsking(true)} disabled={pending} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60">
              Solicitar cambios
            </button>
          </div>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
    </section>
  );
}
