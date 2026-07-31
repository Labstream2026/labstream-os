"use client";

import * as React from "react";
import { Loader2, Eraser } from "lucide-react";
import { cleanupMarcebotPulse, setMarcebotSilencio } from "./marcebot-cleanup-actions";

// Panel admin: saca a Marcebot de las conversaciones. El botón barre lo que ya hay (borrado
// SUAVE, reversible) y el interruptor evita que vuelva. Ni las notificaciones ni el registro
// de actividad se tocan: el bot sigue trabajando, solo deja de hablar en los chats.
export function MarcebotCleanupButton({ silencio }: { silencio: boolean }) {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [callado, setCallado] = React.useState(silencio);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm font-medium">Marcebot fuera de los chats</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Oculta los mensajes que Marcebot dejó en las conversaciones —el pulso «📣 …», los resúmenes
        y los avisos sueltos— en todos los canales, incluido el Chat del día. No toca las
        notificaciones, ni el registro de actividad, ni los archivos que el bot haya entregado.
        Es reversible.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setMsg(null);
            start(async () => {
              const r = await cleanupMarcebotPulse();
              setMsg(r.ok ? `✓ ${r.deleted ?? 0} mensaje(s) de Marcebot ocultados` : `⚠️ ${r.error}`);
            });
          }}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Eraser className="size-3.5" />} Limpiar mensajes de Marcebot
        </button>
        {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          checked={callado}
          disabled={pending}
          onChange={(e) => {
            const on = e.target.checked;
            setCallado(on);
            start(async () => {
              const r = await setMarcebotSilencio(on);
              if (!r.ok) {
                setCallado(!on);
                setMsg(`⚠️ ${r.error}`);
              }
            });
          }}
          className="mt-0.5 size-3.5 shrink-0 accent-[hsl(var(--primary))]"
        />
        <span>
          <span className="font-medium">Que no vuelva a escribir en los chats</span>
          <span className="block text-muted-foreground">
            Deja de espejar el pulso del proyecto en el chat de la cuenta del cliente. Quítalo y
            vuelve a aparecer.
          </span>
        </span>
      </label>
    </div>
  );
}
