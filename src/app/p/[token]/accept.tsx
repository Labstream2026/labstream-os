"use client";

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";
import { acceptProposal, rejectProposal } from "./actions";

// Decisión del cliente sobre la propuesta. Captura nombre y correo para dejar CONSTANCIA de quién
// y cuándo (se guarda con fecha/hora e IP). Al aceptar, el equipo recibe aviso y al cliente le
// llega un comprobante a su buzón. Se adapta al tema (documento / presentación / cine).
//
// También se puede decir que NO, con motivo: hasta ahora el portal solo permitía aceptar y una
// propuesta perdida se quedaba «Enviada» para siempre, sin que nadie supiera por qué. El «no» va
// deliberadamente discreto —un enlace, no un botón grande— para no invitar a rechazar.
export function AcceptProposal({ token, accent, dark = false }: { token: string; accent: string; dark?: boolean }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [pending, start] = React.useTransition();
  const [done, setDone] = React.useState<null | "aceptada" | "rechazada">(null);
  const [emailed, setEmailed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Modo rechazo: pide el motivo en el mismo formulario, sin sacar al cliente de la página.
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");

  const inputStyle: React.CSSProperties = dark
    ? { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.16)", color: "#fff" }
    : { background: "#fff", border: "1px solid #d4d4d4", color: "#171717" };
  const labelColor = dark ? "rgba(238,241,246,0.7)" : "#525252";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      if (rejecting) {
        const r = await rejectProposal(token, name, email, reason);
        if (r.ok) setDone("rechazada");
        else setError(r.error ?? "No se pudo registrar tu respuesta.");
        return;
      }
      const r = await acceptProposal(token, name, email);
      if (r.ok) { setEmailed(!!r.emailed); setDone("aceptada"); }
      else setError(r.error ?? "No se pudo aceptar.");
    });
  }

  if (done) {
    const rechazada = done === "rechazada";
    return (
      <div
        className={dark ? "rounded-2xl p-6 text-center" : "rounded-2xl bg-white p-6 text-center shadow-sm"}
        style={dark ? { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" } : undefined}
      >
        <div
          className="mx-auto flex size-11 items-center justify-center rounded-full"
          style={{ background: rechazada ? (dark ? "rgba(255,255,255,0.12)" : "#e5e5e5") : accent }}
        >
          {rechazada ? (
            <X className="size-6" style={{ color: dark ? "#fff" : "#525252" }} />
          ) : (
            <Check className="size-6 text-white" />
          )}
        </div>
        <p className="mt-3 text-sm font-medium" style={{ color: dark ? "#fff" : "#171717" }}>
          {rechazada ? "Gracias por avisarnos" : "¡Propuesta aceptada!"}
        </p>
        <p className="mt-1 text-sm" style={{ color: labelColor }}>
          {rechazada
            ? "Registramos tu respuesta y el motivo. Nos sirve muchísimo para la próxima."
            : emailed
              ? "Gracias. Te enviamos un correo de confirmación y avisamos al equipo."
              : "Gracias. Registramos tu aceptación y avisamos al equipo."}
        </p>
      </div>
    );
  }

  return (
    <div
      className={dark ? "rounded-2xl p-6" : "rounded-2xl bg-white p-6 shadow-sm"}
      style={dark ? { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" } : undefined}
    >
      <p className="text-sm font-medium" style={{ color: dark ? "#fff" : "#171717" }}>
        {rejecting ? "¿Prefieres no seguir?" : "¿Aceptas esta propuesta?"}
      </p>
      <p className="mt-0.5 text-sm" style={{ color: labelColor }}>
        {rejecting ? "Déjanos saber por qué: nos ayuda a hacerlo mejor la próxima vez." : "Déjanos tus datos y coordinamos los siguientes pasos."}
      </p>

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
        {rejecting ? (
          <div>
            <label className="mb-1 block text-xs" style={{ color: labelColor }}>Motivo</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Se salió del presupuesto · los tiempos no nos sirven · seguimos con otro equipo…"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2"
              style={inputStyle}
              aria-label="Motivo"
            />
          </div>
        ) : null}
        {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          style={
            rejecting
              ? { background: "transparent", color: dark ? "#fff" : "#171717", border: `1px solid ${dark ? "rgba(255,255,255,0.25)" : "#d4d4d4"}` }
              : { background: accent || "#6366f1", color: "#fff" }
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : rejecting ? <X className="size-4" /> : <Check className="size-4" />}
          {rejecting ? "Enviar respuesta" : "Confirmar aceptación"}
        </button>
        <p className="text-center text-[11px]" style={{ color: dark ? "rgba(238,241,246,0.45)" : "#a3a3a3" }}>
          Al confirmar queda registrada la fecha, tu nombre y tu correo.
        </p>
        {/* El «no» va discreto a propósito: existe para que se pueda responder con honestidad,
            no para invitar a rechazar. */}
        <p className="text-center text-xs">
          <button
            type="button"
            onClick={() => { setRejecting((r) => !r); setError(null); }}
            className="underline underline-offset-2 transition-opacity hover:opacity-80"
            style={{ color: dark ? "rgba(238,241,246,0.55)" : "#737373" }}
          >
            {rejecting ? "Volver a aceptar la propuesta" : "Prefiero no seguir con esta propuesta"}
          </button>
        </p>
      </form>
    </div>
  );
}
