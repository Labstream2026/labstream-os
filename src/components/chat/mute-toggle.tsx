"use client";

import * as React from "react";
import { Bell, AtSign, BellOff } from "lucide-react";
import { setChannelNotifyLevel } from "@/app/(app)/chat/actions";

// Nivel de aviso del canal para el usuario actual. Un toque CICLA:
// todo → solo @menciones (el silenciar clásico) → nada (ni menciones) → todo.
// Optimista: cambia al instante y reconcilia con la respuesta del servidor.
export type NotifyLevel = "all" | "mentions" | "none";

const ORDER: NotifyLevel[] = ["all", "mentions", "none"];
const TITLES: Record<NotifyLevel, string> = {
  all: "Avisos: todos los mensajes · toca para dejar solo las @menciones",
  mentions: "Avisos: solo @menciones · toca para silenciar todo",
  none: "Avisos: nada (ni menciones) · toca para reactivar todos",
};

export function NotifyLevelToggle({ channelId, level: initial }: { channelId: string; level: NotifyLevel }) {
  const [level, setLevel] = React.useState<NotifyLevel>(initial);
  const [, startTransition] = React.useTransition();
  React.useEffect(() => setLevel(initial), [initial]);

  const cycle = () => {
    const prev = level;
    const next = ORDER[(ORDER.indexOf(level) + 1) % ORDER.length];
    setLevel(next); // optimista
    startTransition(async () => {
      const ok = await setChannelNotifyLevel(channelId, next);
      if (!ok) setLevel(prev);
    });
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title={TITLES[level]}
      aria-label={TITLES[level]}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {level === "all" ? (
        <Bell className="size-4" />
      ) : level === "mentions" ? (
        <AtSign className="size-4 text-amber-600" />
      ) : (
        <BellOff className="size-4 text-amber-600" />
      )}
    </button>
  );
}
