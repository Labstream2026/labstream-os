"use client";

import { Hash, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelChat, type ChatMe, type ChatMsg } from "@/components/chat/channel-chat";

export function ContextPanel({
  open,
  me,
  channel,
}: {
  open: boolean;
  me: ChatMe;
  channel: { id: string; name: string; messages: ChatMsg[] } | null;
}) {
  return (
    <aside
      className={cn(
        "h-full shrink-0 border-l border-border bg-background transition-all duration-200 overflow-hidden",
        open ? "w-80" : "w-0 border-l-0",
      )}
    >
      <div className="flex h-full w-80 flex-col">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <Hash className="size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Equipo · {channel?.name ?? "general"}</p>
            <p className="truncate text-xs text-muted-foreground">Canal del equipo</p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>

        {channel ? (
          <ChannelChat channelId={channel.id} initialMessages={channel.messages} me={me} />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">No hay canal general.</p>
        )}
      </div>
    </aside>
  );
}
