"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { ChannelChat, type ChatMe, type ChatMsg, type Member } from "@/components/chat/channel-chat";

// Pestaña «Chat» del proyecto: el canal del proyecto embebido en su propia página, sin salir a
// /chat. Reusa /api/chat/dock?project= (mismo endpoint del panel lateral), que ya resuelve el
// canal + mensajes + los extras que igualan al chat completo (línea «Mensajes nuevos», @canal/@Rol,
// «Guardar en Archivos»). Así el equipo Y el cliente coordinan el proyecto en su propia pantalla.
type DockChannel = {
  id: string;
  name: string;
  type: string;
  isPublic: boolean;
  canManage: boolean;
  members: { id: string; name: string; initials: string | null; color: string | null; role?: string }[];
  projectId?: string | null;
};
type DockPayload = {
  channel: DockChannel | null;
  canAccess: boolean;
  messages: ChatMsg[];
  initialLastReadAt?: string | null;
  mentionExtras?: { name: string; hint: string }[];
  canArchive?: boolean;
};

export function ProjectChatTab({ projectId, me, isAdmin }: { projectId: string; me: ChatMe; isAdmin: boolean }) {
  const [dock, setDock] = React.useState<DockPayload | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const load = () => {
      setLoading(true);
      fetch(`/api/chat/dock?project=${projectId}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { channel: null, canAccess: false, messages: [] }))
        .then((d: DockPayload) => { if (!cancelled) setDock(d); })
        .catch(() => { if (!cancelled) setDock({ channel: null, canAccess: false, messages: [] }); })
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Cargando el chat del proyecto…</p>;
  }
  if (!dock?.channel) {
    return <p className="p-6 text-sm text-muted-foreground">Este proyecto aún no tiene chat.</p>;
  }
  if (!dock.canAccess) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <Lock className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">Chat privado del proyecto</p>
        <p className="max-w-xs text-xs text-muted-foreground">No estás en esta conversación. Pídele al responsable que te añada al equipo del proyecto.</p>
      </div>
    );
  }

  const members: Member[] = dock.channel.members.length
    ? dock.channel.members.map((m) => ({ id: m.id, name: m.name }))
    : [];
  // Alto acotado a la ventana del tab: la lista de mensajes hace su propio scroll.
  return (
    <div className="h-[calc(100dvh-13rem)] min-h-[24rem] overflow-hidden rounded-xl border border-border bg-card">
      <ChannelChat
        key={dock.channel.id}
        channelId={dock.channel.id}
        me={me}
        isAdmin={isAdmin}
        members={members}
        initialMessages={dock.messages}
        initialLastReadAt={dock.initialLastReadAt ?? null}
        mentionExtras={dock.mentionExtras ?? []}
        canArchive={dock.canArchive ?? false}
        projectId={dock.channel.projectId ?? projectId}
      />
    </div>
  );
}
