"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { acceptProposal } from "./actions";

export function AcceptProposal({ token, accent, dark = false }: { token: string; accent: string; dark?: boolean }) {
  const [pending, start] = React.useTransition();
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div
      className={dark ? "rounded-2xl p-6 text-center" : "rounded-2xl bg-white p-6 text-center shadow-sm"}
      style={dark ? { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" } : undefined}
    >
      <p className="text-sm" style={dark ? { color: "rgba(238,241,246,0.74)" } : undefined}>
        <span className={dark ? "" : "text-neutral-600"}>¿Te gusta la propuesta? Acéptala y coordinamos los siguientes pasos.</span>
      </p>
      {error ? <p className="mt-2 text-sm text-rose-500">{error}</p> : null}
      <button
        disabled={pending || done}
        onClick={() => {
          setError(null);
          start(async () => {
            try { await acceptProposal(token); setDone(true); }
            catch (e) { setError(e instanceof Error ? e.message : "No se pudo aceptar"); }
          });
        }}
        className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: accent || "#6366f1" }}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {done ? "¡Propuesta aceptada!" : "Aceptar propuesta"}
      </button>
    </div>
  );
}
