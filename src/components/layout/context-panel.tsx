"use client";

import { Hash, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelChat, type ChatMe, type ChatMsg, type Member } from "@/components/chat/channel-chat";

type Channel = { id: string; name: string; messages: ChatMsg[] } | null;

// Cuerpo del chat (cabecera + conversación). Reutilizado por el panel de escritorio
// y la hoja a pantalla completa de móvil.
export function ChatBody({
  me,
  channel,
  members = [],
  onClose,
}: {
  me: ChatMe;
  channel: Channel;
  members?: Member[];
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Hash className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Equipo · {channel?.name ?? "general"}</p>
          <p className="truncate text-xs text-muted-foreground">Canal del equipo</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar chat"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </div>

      {channel ? (
        <ChannelChat channelId={channel.id} initialMessages={channel.messages} me={me} members={members} />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">No hay canal general.</p>
      )}
    </div>
  );
}

// Panel de chat de ESCRITORIO (columna derecha plegable a 0).
export function ContextPanel({ open, me, channel, members = [] }: { open: boolean; me: ChatMe; channel: Channel; members?: Member[] }) {
  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 overflow-hidden border-l border-border bg-background transition-all duration-200 md:block",
        open ? "w-80" : "w-0 border-l-0",
      )}
    >
      <div className="h-full w-80">
        <ChatBody me={me} channel={channel} members={members} />
      </div>
    </aside>
  );
}
