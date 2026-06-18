"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dismissMarcebotChannel } from "./marcebot-actions";

type Msg = { id: string; body: string; createdAt: string };

// Aviso flotante de Marcebot. No está siempre visible: aparece SOLO cuando el bot ha
// dejado un mensaje sin leer (su resumen programado). Trae un único botón «Listo» que,
// al pulsarlo, marca el mensaje como leído y cierra el aviso. Así el usuario se percata
// de leerlo. Comprueba al cargar, al volver a la pestaña y cada par de minutos.
const POLL_MS = 120_000;

export function MarcebotPopup() {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const open = useRef(false);
  open.current = !!channelId;

  const check = useCallback(async () => {
    if (open.current) return; // no recargar mientras el aviso está abierto
    try {
      const res = await fetch("/api/marcebot/pending", { cache: "no-store" });
      if (!res.ok) return;
      const data: { channelId: string | null; messages: Msg[] } = await res.json();
      if (data.channelId && data.messages?.length) {
        setChannelId(data.channelId);
        setMessages(data.messages);
      }
    } catch {
      /* silencioso: es un aviso, no rompe la app */
    }
  }, []);

  useEffect(() => {
    check();
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(check, POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [check]);

  if (!channelId || !messages.length) return null;

  const dismiss = async () => {
    setBusy(true);
    try {
      await dismissMarcebotChannel(channelId);
    } catch {
      /* aun si falla, cerramos el aviso */
    }
    setChannelId(null);
    setMessages([]);
    setBusy(false);
  };

  return (
    <div className="fixed bottom-5 right-5 z-[120] w-[min(92vw,380px)] animate-in fade-in slide-in-from-bottom-4">
      <div className="overflow-hidden rounded-2xl border border-[#F47A20]/40 bg-card shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-border bg-gradient-to-r from-[#F47A20]/15 to-transparent px-4 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F47A20]/20 text-xl">🤖</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Marcebot</p>
            <p className="text-[11px] text-muted-foreground">Tienes un mensaje</p>
          </div>
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto px-4 py-3">
          {messages.map((m) => (
            <p key={m.id} className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
              {m.body}
            </p>
          ))}
        </div>

        <div className="border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="w-full rounded-lg bg-[#F47A20] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Cerrando…" : "Listo ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}
