"use client";

import * as React from "react";
import { MessageCircle, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatLive } from "@/components/layout/chat-live";
import { ProjectChatTab } from "./project-chat-tab";
import { type ChatMe } from "@/components/chat/channel-chat";

// Chat del proyecto como BURBUJA flotante (abajo-derecha), en vez de una pestaña.
// - Badge de NO-LEÍDOS en vivo (useChatLive.unreadOf del canal del proyecto).
// - Se abre en un panel compacto y se esconde de un clic (Minimizar/Cerrar) → más limpio.
// - Reusa ProjectChatTab (resuelve canal + mensajes por /api/chat/dock?project=), sin duplicar chat.
// - CONVIVE con el FAB de crear (QuickCreateFab, bottom-6 right-6): esta burbuja se apila ENCIMA
//   (bottom-[5.75rem] = 24px del FAB + 56px de su botón + 12px de aire) para que vivan las dos.
// - Solo escritorio (hidden md:grid): en móvil ya está la burbuja global de chat del app-shell
//   (que abre el chat de ESTE proyecto por contexto) apilada sobre el FAB — sin triplicar burbujas.
export function ProjectChatBubble({ projectId, me, isAdmin }: { projectId: string; me: ChatMe; isAdmin: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [channelId, setChannelId] = React.useState<string | null>(null);
  const live = useChatLive();

  // Descubre el id del canal del proyecto para poder pintar el badge SIN abrir el panel.
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/chat/dock?project=${projectId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { channel?: { id?: string } } | null) => {
        if (!cancelled && d?.channel?.id) setChannelId(d.channel.id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  const unread = channelId ? live.unreadOf(channelId) ?? 0 : 0;

  if (open) {
    return (
      <div className="fixed bottom-6 right-6 z-50 hidden h-[min(560px,80vh)] w-[min(384px,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl duration-200 animate-in fade-in slide-in-from-bottom-4 md:flex">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2.5">
          <MessageCircle className="size-4 shrink-0 text-primary" />
          <span className="flex-1 truncate text-sm font-semibold">Chat del proyecto</span>
          <button onClick={() => setOpen(false)} aria-label="Minimizar" title="Minimizar" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <Minus className="size-4" />
          </button>
          <button onClick={() => setOpen(false)} aria-label="Cerrar" title="Cerrar" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        {/* ProjectChatTab trae su propio contenedor de alto fijo; aquí lo forzamos a ocupar el panel. */}
        <div className="min-h-0 flex-1 overflow-hidden [&>div]:h-full [&>div]:min-h-0 [&>div]:rounded-none [&>div]:border-0">
          <ProjectChatTab projectId={projectId} me={me} isAdmin={isAdmin} />
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      aria-label="Abrir chat del proyecto"
      title="Chat del proyecto"
      className={cn(
        "group fixed bottom-[5.75rem] right-6 z-50 hidden size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95 md:grid",
      )}
    >
      <MessageCircle className="size-6" />
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 grid min-w-[22px] place-items-center rounded-full border-2 border-background bg-red-500 px-1 text-[11px] font-extrabold leading-[18px] text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}
