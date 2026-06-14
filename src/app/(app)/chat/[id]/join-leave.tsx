"use client";

import { useTransition } from "react";
import { joinChannel, leaveChannel } from "../actions";

// Unirse a un canal público (para que aparezca en "mis chats") o salir.
export function JoinLeave({ channelId, joined }: { channelId: string; joined: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => (joined ? leaveChannel(channelId) : joinChannel(channelId)))}
      className={
        joined
          ? "ml-auto rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          : "ml-auto rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      }
    >
      {joined ? "Salir del canal" : "Unirme"}
    </button>
  );
}
