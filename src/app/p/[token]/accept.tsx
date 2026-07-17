"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { acceptProposal } from "./actions";

// Formulario de aceptación del cliente. Captura nombre y correo para dejar CONSTANCIA de quién y
// cuándo aceptó (se guarda con fecha/hora e IP). Al confirmar, el equipo recibe aviso y al cliente
// le llega un correo de comprobante a su propio buzón. Se adapta al tema (documento / presentación).
export function AcceptProposal({ token, accent, dark = false }: { token: string; accent: string; dark?: boolean }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [pending, start] = React.useTransition();
  const [done, setDone] = React.useState(false);
  const [emailed, setEmailed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const inputStyle: React.CSSProperties = dark
    ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.16)", color: "#fff" }
    : { background: "#fff", border: "1px solid #d4d4d4", color: "#171717" };
  const labelColor = dark ? "rgba(238,241,246,0.7)" : "#525252";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await acceptProposal(token, name, email);
      if (r.ok) { setEmailed(!!r.emailed); setDone(true); }
      else setError(r.error ?? "No se pudo aceptar.");
    });
  }

  if (done) {
    return (
      <div
        className={dark ? "rounded-2xl p-6 text-center" : "rounded-2xl bg-white p-6 text-center shadow-sm"}
        style={dark ? { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" } : undefined}
      >
        <div className="mx-auto flex size-11 items-center justify-center rounded-full" style={{ background: accent }}>
          <Check className="size-6 text-white" />
        </div>
        <p className="mt-3 text-sm font-medium" style={{ color: dark ? "#fff" : "#171717" }}>¡Propuesta aceptada!</p>
        <p className="mt-1 text-sm" style={{ color: labelColor }}>
          {emailed ? "Gracias. Te enviamos un correo de confirmación y avisamos al equipo." : "Gracias. Registramos tu aceptación y avisamos al equipo."}
        </p>
      </div>
    );
  }

  return (
    <div
      className={dark ? "rounded-2xl p-6" : "rounded-2xl bg-white p-6 shadow-sm"}
      style={dark ? { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" } : undefined}
    >
      <p className="text-sm font-medium" style={{ color: dark ? "#fff" : "#171717" }}>¿Aceptas esta propuesta?</p>
      <p className="mt-0.5 text-sm" style={{ color: labelColor }}>Déjanos tus datos y coordinamos los siguientes pasos.</p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs" style={{ color: labelColor }}>Tu nombre</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre y apellido"
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2"
            style={inputStyle}
            aria-label="Tu nombre"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs" style={{ color: labelColor }}>Tu correo</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@empresa.com"
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2"
            style={inputStyle}
            aria-label="Tu correo"
          />
        </div>
        {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: accent || "#6366f1" }}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Confirmar aceptación
        </button>
        <p className="text-center text-[11px]" style={{ color: dark ? "rgba(238,241,246,0.45)" : "#a3a3a3" }}>
          Al confirmar queda registrada la fecha, tu nombre y tu correo.
        </p>
      </form>
    </div>
  );
}
