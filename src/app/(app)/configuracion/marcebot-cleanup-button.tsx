"use client";

import * as React from "react";
import { Loader2, Eraser } from "lucide-react";
import { cleanupMarcebotPulse } from "./marcebot-cleanup-actions";

// Botón admin: borra en suave los mensajes de pulso "📣 …" de Marcebot que quedaron en los
// hilos de conversación de antes del cambio a la barra de estado viva. Reversible. Una vez.
export function MarcebotCleanupButton() {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm font-medium">Limpiar mensajes viejos de Marcebot</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Quita los avisos «📣 …» que Marcebot dejó en los chats de proyecto antes de que el pulso
        pasara a la barra de estado. No borra el feed de la cuenta del cliente ni otros mensajes.
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
    </div>
  );
}
