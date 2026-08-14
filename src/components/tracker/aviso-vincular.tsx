"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Laptop, Loader2, ShieldCheck, X } from "lucide-react";
import { revocarRastreador, vincularRastreador } from "@/app/(app)/perfil/tracker-actions";
import { consultarSensor, enAppEscritorio, entregarToken } from "./puente";

// ── Aviso «vincula este equipo» ──
// Aparece SOLO dentro de la app de escritorio y SOLO cuando el sensor contesta que este
// computador todavía no está vinculado. Un clic y listo. Sin esto, cada persona tendría que
// acordarse de entrar a Ajustes → Perfil y bajar hasta la tarjeta del rastreador — el tipo de
// paso que la mitad del equipo no da nunca, y entonces las horas de esa mitad no existen.
//
// Dice de una qué mide y qué no: que alguien encienda esto sin saber qué enciende no le sirve
// a nadie, y en Colombia (Habeas Data) es justo lo que no se debe hacer.
//
// «Ahora no» dura la sesión del navegador, a propósito: no es una preferencia permanente. Si
// alguien nunca vincula, conviene que el recordatorio vuelva.

const POSPUESTO = "ls-aviso-rastreador-pospuesto";

export function AvisoVincular() {
  const router = useRouter();
  const [visible, setVisible] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, arranca] = React.useTransition();

  React.useEffect(() => {
    let vivo = true;
    void (async () => {
      if (!enAppEscritorio()) return;
      if (window.sessionStorage.getItem(POSPUESTO) === "1") return;
      const estado = await consultarSensor();
      // null = app anterior a la 1.8.0: no trae sensor y el actualizador ya se encarga. No se
      // avisa nada ahí; sería pedirle a la gente que arregle algo que se arregla solo.
      if (vivo && estado && !estado.vinculado) setVisible(true);
    })();
    return () => { vivo = false; };
  }, []);

  if (!visible) return null;

  const vincular = () => {
    setError(null);
    arranca(async () => {
      const r = await vincularRastreador();
      if (!r.ok || !r.token || !r.deviceId) {
        setError(r.error ?? "No se pudo vincular.");
        return;
      }
      const recogido = await entregarToken(r.token);
      if (!recogido) {
        await revocarRastreador(r.deviceId);
        setError("Tu app no trae el rastreador todavía. Ciérrala y ábrela de nuevo.");
        return;
      }
      setVisible(false);
      router.refresh();
    });
  };

  const posponer = () => {
    window.sessionStorage.setItem(POSPUESTO, "1");
    setVisible(false);
  };

  return (
    // El margen va aquí y no en el layout: si estuviera fuera, el hueco quedaría igual en
    // todas las páginas donde este aviso no se pinta (que son casi todas).
    <div className="mx-4 mb-1 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/40 bg-primary/5 px-3.5 py-2.5 sm:mx-8">
      <ShieldCheck className="size-4 shrink-0 text-primary" />
      <p className="min-w-48 flex-1 text-[12px] leading-relaxed">
        <b>Este equipo todavía no registra tus horas.</b>{" "}
        <span className="text-muted-foreground">
          Mide en qué app estás y si hay actividad. Nunca teclas, pantallazos ni contenido, y lo pausas cuando quieras desde la bandeja.
        </span>
        {error ? <span className="block font-medium text-destructive">{error}</span> : null}
      </p>
      <button
        type="button" onClick={vincular} disabled={pendiente}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Laptop className="size-3.5" />}
        Vincular este equipo
      </button>
      <button
        type="button" onClick={posponer} aria-label="Ahora no"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
