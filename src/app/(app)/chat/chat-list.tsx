"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";
import { Hash, Lock, Users, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { createChannel, openMarcebotChat } from "./actions";
import { DmStarter } from "./dm-starter";
import type { ChatListData, ChatListRow } from "./list-data";

// Rail/navegador de chats. Al pulsar una conversación se navega a /chat/[id], que se
// abre en el panel de la derecha (el rail persiste vía el layout). Resalta la activa.
export function ChatList({ data, onNavigate }: { data: ChatListData; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;
  const [creating, setCreating] = React.useState(false);
  const [openingBot, startOpenBot] = React.useTransition();
  const marcebotActive = !!data.marcebot.channelId && data.marcebot.channelId === activeId;

  // Leído estilo WhatsApp: al abrir un chat, su badge de no-leídos se limpia AL INSTANTE en
  // el cliente (el rail vive en el layout y no se re-renderiza al navegar; markChannelRead ya
  // persiste lastReadAt en el servidor para la próxima carga).
  const [readIds, setReadIds] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    if (activeId) setReadIds((prev) => (prev.has(activeId) ? prev : new Set(prev).add(activeId)));
  }, [activeId]);
  const seen = (id: string | null, n: number) => (id && readIds.has(id) ? 0 : n);

  return (
    <div className="flex h-full flex-col">
      {/* Cabecera + acciones rápidas */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <h1 className="shrink-0 text-base font-bold tracking-tight">Chats</h1>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <DmStarter team={data.team} />
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            title="Nuevo grupo o canal"
            className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
          >
            {creating ? <X className="size-4" /> : <Plus className="size-4" />}
          </button>
        </div>
      </div>

      {creating ? (
        <form action={createChannel} className="space-y-2 border-b border-border bg-muted/30 p-3">
          <Input name="name" required placeholder="Nombre del grupo o canal" />
          <select name="isPublic" defaultValue="false" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
            <option value="false">Privado (solo invitados)</option>
            <option value="true">Público (todo el equipo)</option>
          </select>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Añadir al grupo</p>
            <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border bg-background p-1">
              {data.team.length === 0 ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">No hay más personas en el equipo.</p>
              ) : (
                data.team.map((u) => (
                  <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                    <input type="checkbox" name="members" value={u.id} className="size-3.5 shrink-0 rounded border-input accent-primary" />
                    <span className="min-w-0 truncate">{u.name}</span>
                  </label>
                ))
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">En un canal público puedes dejarlo vacío; un grupo privado solo lo verán los invitados.</p>
          </div>
          <button className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Crear</button>
        </form>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {/* Chat del día (canal del equipo): fijo arriba, ya no es una pestaña aparte del menú. */}
        {data.daily.channelId ? (
          <div className="px-2 pb-2">
            <Link
              href={`/chat/${data.daily.channelId}`}
              onClick={onNavigate}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                data.daily.channelId === activeId ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "hover:bg-muted/50",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base">💬</span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="font-medium">{data.daily.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">Canal del equipo · día a día</span>
              </span>
              {seen(data.daily.channelId, data.daily.unread) > 0 ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{seen(data.daily.channelId, data.daily.unread)}</span>
              ) : null}
            </Link>
          </div>
        ) : null}

        {/* Chat directo con Marcebot: fijo arriba. Cada mensaje le habla al asistente sin @. */}
        <div className="px-2 pb-2">
          <button
            type="button"
            disabled={openingBot}
            onClick={() => startOpenBot(() => openMarcebotChat())}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors disabled:opacity-60",
              marcebotActive ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "hover:bg-muted/50",
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-base">🤖</span>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="font-medium">Marcebot</span>
              <span className="truncate text-[11px] text-muted-foreground">Tu asistente · chat directo</span>
            </span>
            {seen(data.marcebot.channelId, data.marcebot.unread) > 0 ? (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{seen(data.marcebot.channelId, data.marcebot.unread)}</span>
            ) : null}
          </button>
        </div>

        <Section title="Mensajes directos" icon={<Users className="size-3.5" />}>
          {data.dms.length === 0 ? <Empty>Sin mensajes directos.</Empty> : data.dms.map((c) => (
            <Row key={c.id} row={{ ...c, unread: seen(c.id, c.unread) }} active={c.id === activeId} onNavigate={onNavigate} />
          ))}
        </Section>

        <Section title="Mis canales" icon={<Hash className="size-3.5" />}>
          {data.channels.length === 0 ? <Empty>No estás en ningún canal.</Empty> : data.channels.map((c) => (
            <Row key={c.id} row={{ ...c, unread: seen(c.id, c.unread) }} active={c.id === activeId} onNavigate={onNavigate} />
          ))}
        </Section>

        {data.explore.length > 0 ? (
          <Section title="Canales del equipo" icon={<Hash className="size-3.5" />}>
            {data.explore.map((c) => (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                onClick={onNavigate}
                className={cn("flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50", c.id === activeId && "bg-sidebar-accent")}
              >
                <Hash className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-muted-foreground">{c.name}</span>
                <span className="text-[11px] text-primary">Abrir →</span>
              </Link>
            ))}
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function Row({ row, active, onNavigate }: { row: ChatListRow; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={`/chat/${row.id}`}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
        active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "hover:bg-muted/50",
      )}
    >
      {row.isDM ? (
        <UserAvatar initials={row.initials} color={row.color} size="sm" />
      ) : row.isPublic ? (
        <Hash className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Lock className="size-4 shrink-0 text-amber-600" />
      )}
      <span className="flex-1 truncate">{row.name}</span>
      {row.unread > 0 ? (
        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{row.unread}</span>
      ) : (
        <span className="text-[10px] text-muted-foreground">{row.meta}</span>
      )}
    </Link>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <h2 className="mb-1 flex items-center gap-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{icon} {title}</h2>
      <div>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-1.5 text-xs text-muted-foreground">{children}</p>;
}
