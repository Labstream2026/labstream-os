"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";
import { Hash, Lock, Users, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createChannel } from "./actions";
import { DmStarter } from "./dm-starter";
import type { ChatListData, ChatListRow } from "./list-data";

// Rail/navegador de chats. Al pulsar una conversación se navega a /chat/[id], que se
// abre en el panel de la derecha (el rail persiste vía el layout). Resalta la activa.
export function ChatList({ data, onNavigate }: { data: ChatListData; onNavigate?: () => void }) {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;
  const [creating, setCreating] = React.useState(false);

  return (
    <div className="flex h-full flex-col">
      {/* Cabecera + acciones rápidas */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
        <h1 className="text-base font-bold tracking-tight">Chats</h1>
        <div className="flex items-center gap-1">
          <DmStarter team={data.team} />
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            title="Nuevo canal"
            className="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
          >
            {creating ? <X className="size-4" /> : <Plus className="size-4" />}
          </button>
        </div>
      </div>

      {creating ? (
        <form action={createChannel} className="space-y-2 border-b border-border bg-muted/30 p-3">
          <input name="name" required placeholder="Nombre del canal" className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <select name="isPublic" defaultValue="true" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
            <option value="true">Público (todo el equipo)</option>
            <option value="false">Privado (solo invitados)</option>
          </select>
          <button className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Crear canal</button>
        </form>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        <Section title="Mensajes directos" icon={<Users className="size-3.5" />}>
          {data.dms.length === 0 ? <Empty>Sin mensajes directos.</Empty> : data.dms.map((c) => (
            <Row key={c.id} row={c} active={c.id === activeId} onNavigate={onNavigate} />
          ))}
        </Section>

        <Section title="Mis canales" icon={<Hash className="size-3.5" />}>
          {data.channels.length === 0 ? <Empty>No estás en ningún canal.</Empty> : data.channels.map((c) => (
            <Row key={c.id} row={c} active={c.id === activeId} onNavigate={onNavigate} />
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
