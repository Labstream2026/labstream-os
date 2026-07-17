"use client";

import * as React from "react";
import { Lock, Loader2, ArrowRight } from "lucide-react";
import { unlockProposal } from "./actions";

// Reja de contraseña del portal público. Cuando la propuesta está protegida y aún no se ha
// desbloqueado (sin cookie válida), esta pantalla reemplaza al contenido. Al acertar, se recarga la
// página: el servidor ya ve la cookie de desbloqueo y renderiza la propuesta. Se adapta al tema.
export function ProposalGate({
  token,
  company,
  tagline,
  accent,
  dark = false,
}: {
  token: string;
  company: string;
  tagline?: string;
  accent: string;
  dark?: boolean;
}) {
  const [pw, setPw] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await unlockProposal(token, pw);
      // Recarga dura: garantiza que la petición nueva lleve la cookie recién puesta y el servidor
      // renderice ya el contenido desbloqueado.
      if (r.ok) window.location.reload();
      else setError(r.error ?? "No se pudo entrar.");
    });
  }

  const inputStyle: React.CSSProperties = dark
    ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff" }
    : {};

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
      style={{ background: dark ? "#0d1017" : "#f5f5f5", color: dark ? "#fff" : "#171717" }}
    >
      <div className="w-full max-w-sm">
        <div
          className="mx-auto flex size-12 items-center justify-center rounded-full"
          style={{ background: dark ? "rgba(255,255,255,0.06)" : "#fff", border: `1px solid ${dark ? "rgba(255,255,255,0.12)" : "#e5e5e5"}` }}
        >
          <Lock className="size-5" style={{ color: accent }} />
        </div>
        <h1 className="mt-5 text-lg font-semibold">{company}</h1>
        <p className="mt-1 text-sm" style={{ color: dark ? "rgba(255,255,255,0.6)" : "#737373" }}>
          {tagline || "Acceso privado"}
        </p>
        <p className="mt-4 text-sm" style={{ color: dark ? "rgba(255,255,255,0.55)" : "#737373" }}>
          Ingresa la contraseña para ver la propuesta.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Contraseña"
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2"
            style={{ ...inputStyle, ...(dark ? {} : { border: "1px solid #d4d4d4", background: "#fff" }) }}
            aria-label="Contraseña"
          />
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          <button
            type="submit"
            disabled={pending || !pw}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: accent }}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
