"use client";

import * as React from "react";
import { Bell, BellOff } from "lucide-react";
import { toggleChannelMute } from "@/app/(app)/chat/actions";

// Campana de silenciar/reactivar avisos del canal para el usuario actual (control del usuario).
// Optimista: cambia al instante y reconcilia con la respuesta del servidor. Las @menciones siguen
// llegando aunque el canal esté silenciado.
export function MuteToggle({ channelId, muted: initial }: { channelId: string; muted: boolean }) {
  const [muted, setMuted] = React.useState(initial);
  const [, startTransition] = React.useTransition();
  React.useEffect(() => setMuted(initial), [initial]);

  const toggle = () => {
    setMuted((v) => !v); // optimista
    startTransition(async () => {
      const res = await toggleChannelMute(channelId);
      if (typeof res === "boolean") setMuted(res);
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={muted}
      title={muted ? "Canal silenciado · toca para reactivar los avisos" : "Silenciar los avisos de este canal"}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {muted ? <BellOff className="size-4 text-amber-600" /> : <Bell className="size-4" />}
    </button>
  );
}
