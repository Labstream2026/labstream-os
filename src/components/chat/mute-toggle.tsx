"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, AtSign, BellOff, Pin } from "lucide-react";
import { setChannelNotifyLevel, toggleChannelPin } from "@/app/(app)/chat/actions";
import { cn } from "@/lib/utils";

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

// Fijar/desfijar este canal arriba del rail. Vive en la cabecera del canal porque el pin del
// rail solo aparece con hover (en pantallas táctiles no existe): este botón funciona en todas.
export function PinToggle({ channelId, pinned: initial }: { channelId: string; pinned: boolean }) {
  const router = useRouter();
  const [pinned, setPinned] = React.useState(initial);
  const [, startTransition] = React.useTransition();
  React.useEffect(() => setPinned(initial), [initial]);

  const toggle = () => {
    const prev = pinned;
    setPinned(!prev); // optimista
    startTransition(async () => {
      const res = await toggleChannelPin(channelId);
      if (typeof res === "boolean") setPinned(res);
      else setPinned(prev);
      router.refresh(); // el rail vive en el layout: refrescar para que (des)aparezca en Fijados
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={pinned}
      title={pinned ? "Desfijar del rail de chats" : "Fijar arriba del rail de chats"}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Pin className={cn("size-4", pinned && "fill-current text-primary")} />
    </button>
  );
}
