"use client";

import * as React from "react";
import { EntityEmoji } from "@/components/icons/marks";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";
import { Hash, Lock, Users, Plus, X, ChevronRight, Building2, Search, BellOff, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { createChannel, toggleChannelPin } from "./actions";
import { CHAT_SECTIONS } from "@/lib/chat-section";
import { DmStarter } from "./dm-starter";
import type { ChatListData, ChatListRow } from "./list-data";

// Chip del tipo de canal dentro del grupo de un cliente (interno del equipo, con el cliente,
// cuenta del cliente) o de un equipo por rol. Colorea sin gritar: borde + texto.
const KIND_META: Record<NonNullable<ChatListRow["kind"]>, { label: string; cls: string }> = {
  interno: { label: "interno", cls: "border-border text-muted-foreground" },
  cliente: { label: "cliente", cls: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  cuenta: { label: "cuenta", cls: "border-violet-500/40 text-violet-600 dark:text-violet-400" },
  equipo: { label: "equipo", cls: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
};

// Búsqueda sin acentos («camara» encuentra «Cámara»), igual que los filtros de proyectos.
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Rail/navegador de chats. Al pulsar una conversación se navega a /chat/[id], que se
// abre en el panel de la derecha (el rail persiste vía el layout). Resalta la activa.
export function ChatList({ data, canCreate = false, onNavigate }: { data: ChatListData; canCreate?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;
  const [creating, setCreating] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [, startTransition] = React.useTransition();

  // Leído estilo WhatsApp: al abrir un chat, su badge de no-leídos se limpia AL INSTANTE en
  // el cliente (el rail vive en el layout y no se re-renderiza al navegar; markChannelRead ya
  // persiste lastReadAt en el servidor para la próxima carga).
  const [readIds, setReadIds] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    if (activeId) setReadIds((prev) => (prev.has(activeId) ? prev : new Set(prev).add(activeId)));
  }, [activeId]);
  const seen = (id: string | null, n: number) => (id && readIds.has(id) ? 0 : n);
  // Los canales SILENCIADOS no suman al badge de su sección (se ven en gris en su fila).
  const sum = (rows: ChatListRow[]) => rows.reduce((n, c) => n + (c.muted ? 0 : seen(c.id, c.unread)), 0);

  const togglePin = (id: string) =>
    startTransition(async () => {
      await toggleChannelPin(id);
      router.refresh();
    });

  // Filtro del buscador: por nombre del chat, cliente o último mensaje.
  const q = norm(query.trim());
  const searching = q.length > 0;
  const match = (r: ChatListRow) => !searching || norm(r.name).includes(q) || (r.last ? norm(r.last).includes(q) : false);
  const pinned = data.pinned.filter(match);
  const dms = data.dms.filter(match);
  const groups = data.groups.filter(match);
  const clientGroups = data.clientGroups
    .map((g) => (searching && norm(g.clientName).includes(q) ? g : { ...g, channels: g.channels.filter(match) }))
    .filter((g) => g.channels.length > 0);
  const explore = data.explore.filter((c) => !searching || norm(c.name).includes(q));
  const dailyVisible = data.daily.channelId && (!searching || norm(data.daily.name).includes(q));
  const nothing = !dailyVisible && pinned.length === 0 && dms.length === 0 && groups.length === 0 && clientGroups.length === 0 && explore.length === 0;

  const rowProps = { active: activeId, onNavigate, onTogglePin: togglePin };

  return (
    <div className="flex h-full flex-col">
      {/* Cabecera + acciones rápidas */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-3">
        <h1 className="shrink-0 text-base font-bold tracking-tight">Chats</h1>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
          <DmStarter team={data.team} />
          {canCreate ? (
            <button
              type="button"
              onClick={() => setCreating((v) => !v)}
              title="Nuevo grupo o canal"
              className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
            >
              {creating ? <X className="size-4" /> : <Plus className="size-4" />}
            </button>
          ) : null}
        </div>
      </div>

      {creating ? (
        <form action={createChannel} className="space-y-2 border-b border-border bg-muted/30 p-3">
          <Input name="name" required placeholder="Nombre del grupo o canal" />
          <select name="isPublic" defaultValue="false" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
            <option value="false">Privado (solo invitados)</option>
            <option value="true">Público (todo el equipo)</option>
          </select>
          {/* Asignar el grupo a una sección de la app: solo entran/etiquetan personas con acceso a ella. */}
          <select name="section" defaultValue="" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm">
            <option value="">Sin sección (grupo normal)</option>
            {Object.entries(CHAT_SECTIONS).map(([k, m]) => (
              <option key={k} value={k}>Asignar a {m.label}</option>
            ))}
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

      {/* Buscador de conversaciones (filtra el rail al escribir). */}
      <div className="border-b border-border px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar conversación…"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {/* Fijados por el usuario: siempre arriba, en el orden en que se fijaron. */}
        {pinned.length > 0 ? (
          <Collapsible
            storeId="pinned"
            title="Fijados"
            leading={<Pin className="size-4 text-muted-foreground" />}
            count={pinned.length}
            unread={sum(pinned)}
            forceOpen={searching || pinned.some((c) => c.id === activeId)}
            defaultOpen
          >
            {pinned.map((c) => (
              <Row key={c.id} row={{ ...c, unread: seen(c.id, c.unread) }} {...rowProps} indent showMeta />
            ))}
          </Collapsible>
        ) : null}

        {/* Chat del día (canal del equipo): fijo arriba, ya no es una pestaña aparte del menú. */}
        {dailyVisible ? (
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

        {/* Clientes: sección maestra colapsable (oculta/muestra TODOS los clientes de una
            vez para limpiar la vista) y, dentro, cada cliente despliega sus chats. */}
        {clientGroups.length > 0 ? (
          <Collapsible
            storeId="clients-section"
            title="Clientes"
            leading={<Building2 className="size-4 text-muted-foreground" />}
            count={clientGroups.length}
            unread={clientGroups.reduce((n, g) => n + sum(g.channels), 0)}
            forceOpen={searching || clientGroups.some((g) => g.channels.some((c) => c.id === activeId))}
            defaultOpen
          >
            {clientGroups.map((g) => (
              <Collapsible
                key={g.clientId}
                storeId={`client:${g.clientId}`}
                title={g.clientName}
                leading={<span className="text-base leading-none"><EntityEmoji value={g.emoji} fallback="🏢" /></span>}
                count={g.channels.length}
                unread={sum(g.channels)}
                forceOpen={searching || g.channels.some((c) => c.id === activeId)}
              >
                {g.channels.map((c) => (
                  <Row key={c.id} row={{ ...c, unread: seen(c.id, c.unread) }} {...rowProps} indent />
                ))}
              </Collapsible>
            ))}
          </Collapsible>
        ) : null}

        {/* Mensajes directos (colapsable). */}
        {!searching || dms.length > 0 ? (
          <Collapsible
            storeId="dms"
            title="Mensajes directos"
            leading={<Users className="size-4 text-muted-foreground" />}
            count={dms.length}
            unread={sum(dms)}
            forceOpen={searching || dms.some((c) => c.id === activeId)}
            defaultOpen
          >
            {dms.length === 0 ? <Empty>Sin mensajes directos.</Empty> : dms.map((c) => (
              <Row key={c.id} row={{ ...c, unread: seen(c.id, c.unread) }} {...rowProps} indent />
            ))}
          </Collapsible>
        ) : null}

        {/* Grupos sin cliente: equipos por rol, canales de equipo, etc. (colapsable). */}
        {groups.length > 0 ? (
          <Collapsible
            storeId="groups"
            title="Grupos"
            leading={<Hash className="size-4 text-muted-foreground" />}
            count={groups.length}
            unread={sum(groups)}
            forceOpen={searching || groups.some((c) => c.id === activeId)}
            defaultOpen
          >
            {groups.map((c) => (
              <Row key={c.id} row={{ ...c, unread: seen(c.id, c.unread) }} {...rowProps} indent />
            ))}
          </Collapsible>
        ) : null}

        {explore.length > 0 ? (
          <Collapsible storeId="explore" title="Canales del equipo" leading={<Hash className="size-4 text-muted-foreground" />} count={explore.length} forceOpen={searching}>
            {explore.map((c) => (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                onClick={onNavigate}
                className={cn("flex items-center gap-2 py-2 pl-7 pr-3 text-sm hover:bg-muted/50", c.id === activeId && "bg-sidebar-accent")}
              >
                <Hash className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-muted-foreground">{c.name}</span>
                <span className="text-[11px] text-primary">Abrir →</span>
              </Link>
            ))}
          </Collapsible>
        ) : null}

        {nothing ? <Empty>Nada coincide con «{query.trim()}».</Empty> : null}
      </div>
    </div>
  );
}

function Row({
  row,
  active,
  onNavigate,
  indent,
  onTogglePin,
  showMeta,
}: {
  row: ChatListRow;
  active: string | null;
  onNavigate?: () => void;
  indent?: boolean;
  onTogglePin: (id: string) => void;
  showMeta?: boolean; // en Fijados, `meta` trae el cliente de contexto
}) {
  const kind = row.kind ? KIND_META[row.kind] : null;
  return (
    <Link
      href={`/chat/${row.id}`}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 py-1.5 text-sm transition-colors",
        indent ? "pl-7 pr-3" : "px-3",
        active === row.id ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "hover:bg-muted/50",
      )}
    >
      {row.isDM ? (
        <UserAvatar initials={row.initials} color={row.color} size="sm" />
      ) : row.isPublic ? (
        <Hash className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Lock className="size-4 shrink-0 text-amber-600" />
      )}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate">{row.name}</span>
          {kind ? (
            <span className={cn("shrink-0 rounded border px-1 text-[9px] font-medium uppercase tracking-wide", kind.cls)}>{kind.label}</span>
          ) : null}
          {row.muted ? <BellOff className="size-3 shrink-0 text-muted-foreground" aria-label="Silenciado" /> : null}
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {showMeta && row.meta ? `${row.meta}${row.last ? ` · ${row.last}` : ""}` : row.last ?? row.meta}
        </span>
      </span>
      <span className="relative flex shrink-0 flex-col items-end gap-0.5 self-start pt-0.5">
        <span className="text-[10px] text-muted-foreground group-hover:invisible">{row.when ?? ""}</span>
        {row.unread > 0 ? (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              row.muted ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {row.unread}
          </span>
        ) : null}
        {/* Fijar/desfijar: aparece al pasar el mouse (tapa la hora, no mueve el layout). */}
        <button
          type="button"
          title={row.pinned ? "Desfijar del rail" : "Fijar arriba del rail"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin(row.id);
          }}
          className="absolute -right-1 -top-1 hidden size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground group-hover:flex"
        >
          <Pin className={cn("size-3.5", row.pinned && "fill-current text-primary")} />
        </button>
      </span>
    </Link>
  );
}

// Sección colapsable del rail: chevron + título + contador + badge de no-leídos. La
// preferencia abierto/cerrado se guarda por sección (localStorage). `forceOpen` mantiene
// abierta la sección que contiene el chat activo aunque esté guardada como cerrada.
function Collapsible({
  storeId,
  title,
  leading,
  count,
  unread = 0,
  defaultOpen = false,
  forceOpen = false,
  children,
}: {
  storeId: string;
  title: string;
  leading?: React.ReactNode;
  count?: number;
  unread?: number;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  React.useEffect(() => {
    const v = window.localStorage.getItem(`chat:collapse:${storeId}`);
    if (v === "1") setOpen(true);
    else if (v === "0") setOpen(false);
  }, [storeId]);
  const toggle = () =>
    setOpen((o) => {
      const n = !o;
      window.localStorage.setItem(`chat:collapse:${storeId}`, n ? "1" : "0");
      return n;
    });
  const shown = open || forceOpen;
  return (
    <section className="mb-1.5">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-muted/50"
      >
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", shown && "rotate-90")} />
        {leading}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        {count != null ? <span className="text-[11px] text-muted-foreground">{count}</span> : null}
        {unread > 0 ? (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{unread}</span>
        ) : null}
      </button>
      {shown ? <div className="mt-0.5">{children}</div> : null}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-1.5 text-xs text-muted-foreground">{children}</p>;
}
