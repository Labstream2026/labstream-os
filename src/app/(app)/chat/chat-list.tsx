"use client";

import * as React from "react";
import { EntityEmoji } from "@/components/icons/marks";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";
import { Hash, Lock, Users, Plus, X, ChevronRight, Building2, Search, BellOff, Pin, MessagesSquare, AtSign, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { createChannel, toggleChannelPin, searchMessages, type MessageSearchHit } from "./actions";
import { CHAT_SECTIONS } from "@/lib/chat-section";
import { DmStarter } from "./dm-starter";
import type { ChatListData, ChatListRow } from "./list-data";
import { useChatLive } from "@/components/layout/chat-live";

// Chip del tipo de canal dentro del grupo de un cliente (proyecto, cuenta del cliente) o de un
// equipo por rol. Colorea sin gritar: borde + texto. Con UN solo canal por proyecto, el chip del
// canal de proyecto dice «proyecto» (la clave "interno" se conserva por compatibilidad).
const KIND_META: Record<NonNullable<ChatListRow["kind"]>, { label: string; cls: string }> = {
  interno: { label: "proyecto", cls: "border-border text-muted-foreground" },
  cliente: { label: "cliente", cls: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
  cuenta: { label: "cuenta", cls: "border-violet-500/40 text-violet-600 dark:text-violet-400" },
  equipo: { label: "equipo", cls: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
};

// Búsqueda sin acentos («camara» encuentra «Cámara»), igual que los filtros de proyectos.
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Filtros rápidos de la lista (Dirección C: priorizar por ATENCIÓN, no solo por fecha).
type Filter = "all" | "unread" | "mention" | "dm" | "proj";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "unread", label: "No leídos" },
  { key: "mention", label: "Menciones" },
  { key: "dm", label: "Directos" },
  { key: "proj", label: "Proyectos" },
];

// Rail/navegador de chats. Al pulsar una conversación se navega a /chat/[id], que se
// abre en el panel de la derecha (el rail persiste vía el layout). Resalta la activa.
export function ChatList({ data, canCreate = false, onNavigate }: { data: ChatListData; canCreate?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const activeId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;
  const [creating, setCreating] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  // Búsqueda server-side EN los mensajes (se dispara a mano; el filtro de conversaciones es en vivo).
  const [hits, setHits] = React.useState<MessageSearchHit[] | null>(null);
  const [seeking, setSeeking] = React.useState(false);
  // Guardia de vigencia: si el usuario re-busca antes de que llegue la respuesta anterior, la
  // respuesta VIEJA no debe pisar el estado (se mostraría bajo la consulta nueva).
  const searchSeq = React.useRef(0);
  const [, startTransition] = React.useTransition();

  const searchInMessages = () => {
    const q = query.trim();
    if (q.length < 2) return;
    const seq = ++searchSeq.current;
    setSeeking(true);
    startTransition(async () => {
      try {
        const res = await searchMessages(q);
        if (searchSeq.current === seq) setHits(res);
      } finally {
        if (searchSeq.current === seq) setSeeking(false);
      }
    });
  };

  // Leído estilo WhatsApp: al abrir un chat, su badge de no-leídos se limpia AL INSTANTE en
  // el cliente (markChannelRead ya persiste lastReadAt en el servidor).
  const [readIds, setReadIds] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    if (activeId) setReadIds((prev) => (prev.has(activeId) ? prev : new Set(prev).add(activeId)));
  }, [activeId]);
  // ── Rail VIVO ── El stream global (/api/chat/stream) trae los conteos reales (con debounce)
  // y un aviso ligero por mensaje para refrescar el preview y el orden sin recargar.
  const live = useChatLive();
  const subscribe = live.subscribe;
  const [livePrev, setLivePrev] = React.useState<Map<string, { last: string; lastAt: string }>>(() => new Map());
  const knownIds = React.useMemo(() => {
    const s = new Set<string>();
    if (data.daily.channelId) s.add(data.daily.channelId);
    for (const r of [...data.pinned, ...data.dms, ...data.groups]) s.add(r.id);
    for (const g of data.clientGroups) for (const r of g.channels) s.add(r.id);
    // Explorar también es «conocido»: un canal público ojeado sin unirse tiene estado de
    // lectura (el stream le emite actividad) y NO debe disparar el refresh de canal-nuevo.
    for (const c of data.explore) s.add(c.id);
    return s;
  }, [data]);
  const activeIdRef = React.useRef(activeId);
  React.useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  const refreshAt = React.useRef(0);
  React.useEffect(() => {
    return subscribe((m) => {
      if (m.parentId) return; // las respuestas de hilo no cambian preview/orden del rail
      if (!knownIds.has(m.channelId)) {
        // Mensaje en un canal que el rail no conoce (¿me añadieron a un proyecto/canal?):
        // recargar el rail server-render, con throttle para no ciclar.
        if (Date.now() - refreshAt.current > 60000) {
          refreshAt.current = Date.now();
          router.refresh();
        }
        return;
      }
      // El canal dejó de estar «recién leído» si llega algo nuevo y NO lo tengo abierto:
      // sin esto, readIds lo forzaba a 0 para siempre y el badge nuevo no aparecía.
      if (m.channelId !== activeIdRef.current) {
        setReadIds((prev) => {
          if (!prev.has(m.channelId)) return prev;
          const next = new Set(prev);
          next.delete(m.channelId);
          return next;
        });
      }
      const who = m.author ? `${m.author.split(" ")[0]}: ` : "";
      const body = m.body.replace(/\s+/g, " ").trim();
      setLivePrev((prev) => {
        const next = new Map(prev);
        next.set(m.channelId, { last: `${who}${body}`, lastAt: m.createdAt });
        return next;
      });
    });
  }, [subscribe, knownIds, router]);

  // Conteo final de una fila: lo «recién leído» (readIds) manda SIEMPRE a cero — el resumen
  // vivo puede llegar 1-2 s tarde tras markChannelRead y el badge parpadeaba al salir del
  // canal; la suscripción de arriba saca al canal de readIds cuando llega algo nuevo.
  // Con resumen vivo manda el stream; sin resumen aún, el valor server-render.
  const unreadOf = (id: string | null, fallback: number) => {
    if (!id) return 0;
    if (readIds.has(id) || id === activeId) return 0;
    if (live.version > 0) return live.unreadOf(id) ?? 0;
    return fallback;
  };
  // Fila con overlay vivo: conteo + (si el stream trajo algo más nuevo) preview y hora.
  const withLive = (r: ChatListRow): ChatListRow => {
    const unread = unreadOf(r.id, r.unread);
    const p = livePrev.get(r.id);
    if (p && (!r.lastAt || p.lastAt > r.lastAt)) {
      return { ...r, unread, last: p.last, lastAt: p.lastAt, when: "ahora" };
    }
    return unread === r.unread ? r : { ...r, unread };
  };
  const byActivity = (a: ChatListRow, b: ChatListRow) =>
    (b.lastAt ? Date.parse(b.lastAt) : 0) - (a.lastAt ? Date.parse(a.lastAt) : 0);
  // Los canales SILENCIADOS no suman al badge de su sección (se ven en gris en su fila).
  const sum = (rows: ChatListRow[]) => rows.reduce((n, c) => n + (c.muted ? 0 : c.unread), 0);

  const togglePin = (id: string) =>
    startTransition(async () => {
      await toggleChannelPin(id);
      router.refresh();
    });

  // Filtro del buscador: por nombre del chat, cliente o último mensaje. `meta` también cuenta:
  // en los Fijados lleva el nombre del cliente de contexto (buscar «acme» debe encontrarlos).
  const q = norm(query.trim());
  const searching = q.length > 0;
  const match = (r: ChatListRow) =>
    !searching || norm(r.name).includes(q) || (r.last ? norm(r.last).includes(q) : false) || norm(r.meta).includes(q);
  // Filtro rápido activo (Dirección C). Se aplica DESPUÉS del overlay vivo (unread/mentions frescos).
  const passFilter = (r: ChatListRow) => {
    if (filter === "unread") return r.unread > 0;
    if (filter === "mention") return r.mentions > 0;
    if (filter === "dm") return r.isDM;
    if (filter === "proj") return r.kind === "interno";
    return true; // "all"
  };
  // Overlay vivo + re-orden por actividad (un mensaje nuevo sube su conversación, como Slack).
  // Los fijados conservan su orden de fijado a propósito.
  const pinned = data.pinned.filter(match).map(withLive).filter(passFilter);
  const dms = data.dms.filter(match).map(withLive).filter(passFilter).sort(byActivity);
  const groups = data.groups.filter(match).map(withLive).filter(passFilter).sort(byActivity);
  const clientGroups = data.clientGroups
    .map((g) => (searching && norm(g.clientName).includes(q) ? g : { ...g, channels: g.channels.filter(match) }))
    .map((g) => ({ ...g, channels: g.channels.map(withLive).filter(passFilter).sort(byActivity) }))
    .filter((g) => g.channels.length > 0);
  // «Explorar» y el chat del día son navegación de fondo: se ocultan al aplicar cualquier filtro.
  const explore = filter === "all" ? data.explore.filter((c) => !searching || norm(c.name).includes(q)) : [];
  const dailyUnreadN = data.daily.channelId ? unreadOf(data.daily.channelId, data.daily.unread) : 0;
  const dailyVisible =
    !!data.daily.channelId &&
    (filter === "all" || (filter === "unread" && dailyUnreadN > 0)) &&
    (!searching || norm(data.daily.name).includes(q));

  // ── REQUIERE RESPUESTA (bloque de atención, Dirección C) ──
  // Lo urgente flota arriba sin importar el cliente/proyecto: menciones primero, luego más no-leídos,
  // luego lo más reciente. Solo en la vista «Todos» y cuando hay volumen (≥3) que valga la pena separar.
  const liveAll = [
    ...data.pinned, ...data.dms, ...data.groups, ...data.clientGroups.flatMap((g) => g.channels),
  ].map(withLive);
  const totalUnread = liveAll.reduce((n, r) => n + (r.muted ? 0 : r.unread), 0) + dailyUnreadN;
  const totalMentions = liveAll.reduce((n, r) => n + r.mentions, 0);
  const urgent = liveAll
    .filter((r) => !r.muted && (r.unread > 0 || r.mentions > 0))
    .sort((a, b) => b.mentions - a.mentions || b.unread - a.unread || byActivity(a, b))
    .slice(0, 8);
  const showUrgent = filter === "all" && !searching && urgent.length >= 3;

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
            onChange={(e) => {
              setQuery(e.target.value);
              searchSeq.current++; // invalida cualquier búsqueda de mensajes en vuelo
              setHits(null); // cambió lo buscado: los resultados de mensajes quedan viejos
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchInMessages();
            }}
            placeholder="Buscar conversación…"
            className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setHits(null);
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        {query.trim().length >= 2 && hits === null ? (
          <button
            type="button"
            onClick={searchInMessages}
            disabled={seeking}
            className="mt-1.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-medium text-primary hover:bg-muted/50 disabled:opacity-50"
          >
            <MessagesSquare className="size-3.5 shrink-0" />
            {seeking ? "Buscando en los mensajes…" : <>Buscar «{query.trim()}» en los mensajes (Enter)</>}
          </button>
        ) : null}
      </div>

      {/* Filtros rápidos (Dirección C): No leídos / Menciones priorizan por atención; Directos /
          Proyectos por tipo. La píldora activa se llena con un cambio de color suave. */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const n = f.key === "unread" ? totalUnread : f.key === "mention" ? totalMentions : 0;
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-200",
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {f.label}
              {n > 0 ? (
                <span className={cn("rounded-full px-1 text-[10px] font-bold tabular-nums", on ? "bg-background/25 text-background" : "bg-primary text-primary-foreground")}>{n > 99 ? "99+" : n}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {/* Requiere respuesta: lo urgente flota arriba (menciones y más no-leídos primero), sin
            importar el cliente. Es el corazón de la Dirección C: prioriza por atención, no por fecha. */}
        {showUrgent ? (
          <div className="mb-2 px-2">
            <div className="flex items-center gap-1.5 px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <Zap className="size-3.5" /> Requiere respuesta
              <span className="ml-auto rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">{urgent.length}</span>
            </div>
            <div className="rounded-lg bg-primary/[0.05] p-1">
              {urgent.map((c) => (
                <Row key={`u-${c.id}`} row={c} {...rowProps} />
              ))}
            </div>
          </div>
        ) : null}

        {/* Resultados de la búsqueda EN los mensajes: cada uno abre el chat en ese mensaje
            exacto (permalink ?msg= → scroll + resaltado). */}
        {hits !== null ? (
          <div className="mb-2 border-b border-border px-2 pb-2">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Mensajes{hits.length > 0 ? ` (${hits.length})` : ""}
            </p>
            {hits.length === 0 ? (
              <Empty>Nada en los mensajes con «{query.trim()}».</Empty>
            ) : (
              hits.map((h) => (
                <Link
                  key={h.id}
                  href={`/chat/${h.channelId}?msg=${h.anchor}`}
                  onClick={onNavigate}
                  className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-medium">{h.channelName}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(h.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {h.author ? `${h.author}: ` : ""}
                    {h.body}
                  </span>
                </Link>
              ))
            )}
          </div>
        ) : null}

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
              <Row key={c.id} row={c} {...rowProps} indent showMeta />
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
              {unreadOf(data.daily.channelId, data.daily.unread) > 0 ? (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">{unreadOf(data.daily.channelId, data.daily.unread)}</span>
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
                  <Row key={c.id} row={c} {...rowProps} indent />
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
              <Row key={c.id} row={c} {...rowProps} indent />
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
              <Row key={c.id} row={c} {...rowProps} indent />
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

        {nothing ? (
          <Empty>
            {searching
              ? `Nada coincide con «${query.trim()}».`
              : filter === "unread"
                ? "Todo al día — no hay chats sin leer. 🎉"
                : filter === "mention"
                  ? "No tienes menciones sin leer."
                  : filter === "dm"
                    ? "Sin mensajes directos."
                    : filter === "proj"
                      ? "No hay chats de proyecto por aquí."
                      : "Nada por aquí todavía."}
          </Empty>
        ) : null}
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
  const emph = row.unread > 0 && !row.muted; // no leído → se resalta (Dirección C: prioriza atención)
  return (
    <Link
      href={`/chat/${row.id}`}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-md py-1.5 text-sm transition-colors duration-150",
        indent ? "pl-7 pr-3" : "px-3",
        active === row.id
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : emph
            ? "bg-primary/[0.04] hover:bg-primary/[0.08]"
            : "hover:bg-muted/50",
      )}
    >
      {/* Barra de acento cuando hay una MENCIÓN sin leer (la señal más alta). */}
      {row.mentions > 0 && active !== row.id ? <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" /> : null}
      {row.isDM ? (
        <UserAvatar initials={row.initials} color={row.color} size="sm" presence={row.otherPresence} dnd={row.otherDnd} />
      ) : row.isPublic ? (
        <Hash className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <Lock className="size-4 shrink-0 text-amber-600" />
      )}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn("min-w-0 truncate", emph && "font-semibold text-foreground")}>{row.name}</span>
          {kind ? (
            <span className={cn("shrink-0 rounded border px-1 text-[9px] font-medium uppercase tracking-wide", kind.cls)}>{kind.label}</span>
          ) : null}
          {row.mentions > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-primary/15 px-1 text-[9px] font-bold text-primary" title={`${row.mentions} mención(es) sin leer`}>
              <AtSign className="size-2.5" />{row.mentions}
            </span>
          ) : null}
          {row.muted ? <BellOff className="size-3 shrink-0 text-muted-foreground" aria-label="Silenciado" /> : null}
        </span>
        <span className={cn("truncate text-[11px]", emph ? "text-foreground/70" : "text-muted-foreground")}>
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
          className="absolute -right-1 -top-1 hidden size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground group-focus-within:flex group-hover:flex"
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
      {/* Colapso FLUIDO: se anima grid-template-rows 1fr↔0fr (el hijo siempre está montado, así la
          altura transiciona suave en vez de saltar). Cerrado → sin interacción ni foco. */}
      <div className={cn("grid transition-[grid-template-rows,opacity] duration-300 ease-out", shown ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className={cn("min-h-0 overflow-hidden", !shown && "pointer-events-none")} aria-hidden={!shown}>
          <div className="mt-0.5">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-1.5 text-xs text-muted-foreground">{children}</p>;
}
