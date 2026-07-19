import { cache } from "react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { ensureProjectChannels } from "@/lib/project-chat";
import { ensureRoleChannels } from "@/lib/role-chat";
import { sessionHasSectionAccess } from "@/lib/chat-section-access";
import { unreadByChannel } from "@/lib/chat-unread";
import { isDndActive } from "@/lib/notif-silence";

// Datos de la lista de chats (rail navegador). Compartido por el layout (rail de
// escritorio) y la página índice (lista a pantalla completa en móvil), para no duplicar
// la consulta.

export type ChatListRow = {
  id: string;
  name: string;
  initials: string | null;
  color: string | null;
  isPublic: boolean;
  isDM: boolean;
  otherPresence?: string | null; // (solo DMs) estado del interlocutor: activo/ocupado/ausente
  otherDnd?: boolean; // (solo DMs) el interlocutor tiene «No molestar» vigente
  unread: number;
  mentions: number; // menciones @ SIN leer en este canal (señal alta: prioriza y alimenta «Menciones»)
  muted: boolean; // silenciado por MÍ: badge en gris y fuera de los agregados de sección
  pinned: boolean; // fijado por MÍ (se saca de su sección y va en «Fijados»)
  kind: "interno" | "cliente" | "cuenta" | "equipo" | null; // chip del tipo de canal
  last: string | null; // último mensaje («Autor: texto») como subtítulo
  lastAt: string | null; // ISO del último mensaje (orden por actividad)
  when: string | null; // hora relativa corta («2h», «ayer») calculada AQUÍ en el servidor: en el
  // cliente Date.now() en render viola la pureza y desincroniza la hidratación
  meta: string; // "N msj." (DM) o "N miembros" (canal); en fijados, el cliente de contexto
};

// Un cliente con sus chats (de proyecto + el del propio cliente), para agrupar/colapsar el rail.
export type ChatClientGroup = {
  clientId: string;
  clientName: string;
  emoji: string | null;
  channels: ChatListRow[];
  unread: number; // suma de no-leídos del grupo (sin los silenciados)
};

export type ChatListData = {
  daily: { channelId: string | null; name: string; unread: number }; // "Chat del día" (canal de equipo), fijado aparte
  pinned: ChatListRow[]; // fijados por el usuario (arriba del rail)
  dms: ChatListRow[];
  clientGroups: ChatClientGroup[]; // chats agrupados por cliente (colapsables)
  groups: ChatListRow[]; // grupos/canales sin cliente (equipos por rol, canales del equipo, etc.)
  explore: { id: string; name: string }[];
  team: { id: string; name: string }[];
};

// No leídos por canal: vive en src/lib/chat-unread.ts (unreadByChannel), COMPARTIDO con el
// badge global del layout y el stream /api/chat/stream para que los números cuadren siempre.

// Último mensaje visible por canal (para el subtítulo del rail y el orden por actividad).
type LastMessage = { body: string; at: Date; author: string | null };
async function lastMessageByChannel(channelIds: string[]): Promise<Map<string, LastMessage>> {
  if (channelIds.length === 0) return new Map();
  // Solo mensajes RAÍZ (las respuestas de hilo no cuentan como no-leídos: si movieran el canal
  // al tope con su texto de subtítulo, el orden y el badge se contradirían).
  // LATERAL por canal en vez de DISTINCT ON: el índice (channelId, createdAt) se recorre hacia
  // atrás con LIMIT 1 por canal (11ms vs 484ms a 300k mensajes — DISTINCT ON ordenaba TODOS los
  // mensajes raíz de los canales visibles en disco porque la dirección mixta no la cubre el índice).
  const rows = await db.$queryRaw<{ channelId: string; body: string; createdAt: Date; author: string | null }[]>`
    SELECT t."channelId" AS "channelId", t.body AS body, t."createdAt" AS "createdAt", u.name AS author
    FROM unnest(ARRAY[${Prisma.join(channelIds)}]) AS c(id)
    JOIN LATERAL (
      SELECT m."channelId", m.body, m."createdAt", m."authorId"
      FROM "ChatMessage" m
      WHERE m."channelId" = c.id AND m."deletedAt" IS NULL AND m."parentId" IS NULL
      ORDER BY m."createdAt" DESC
      LIMIT 1
    ) t ON true
    LEFT JOIN "User" u ON u.id = t."authorId"
  `.catch(() => [] as { channelId: string; body: string; createdAt: Date; author: string | null }[]);
  return new Map(rows.map((r) => [r.channelId, { body: r.body, at: r.createdAt, author: r.author }] as const));
}

// Hora relativa corta del último mensaje (tan fresca como la carga del rail, igual que el resto).
function timeAgo(at: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - at.getTime()) / 1000));
  if (s < 60) return "ahora";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `${d}d`;
  return at.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
}

// «Autor: texto» en una línea para el subtítulo del rail.
function previewOf(last: LastMessage | undefined, myName: string): { last: string | null; lastAt: string | null; when: string | null } {
  if (!last) return { last: null, lastAt: null, when: null };
  const who = last.author ? (last.author === myName ? "Tú" : last.author.split(" ")[0]) : null;
  const body = last.body.replace(/\s+/g, " ").trim();
  return { last: who ? `${who}: ${body}` : body, lastAt: last.at.toISOString(), when: timeAgo(last.at) };
}

const activityOf = (r: ChatListRow) => (r.lastAt ? Date.parse(r.lastAt) : 0);

// cache(): en /chat la consulta corre en el layout (rail de escritorio) Y en la página índice
// (lista móvil) del MISMO request; sin cache se pagaba dos veces.
export const getChatListData = cache(async (session: SessionUser): Promise<ChatListData> => {
  // El PORTAL DEL CLIENTE solo ve el chat de SU(S) proyecto(s): nada de canales públicos, DMs,
  // explorar ni la lista de personas del equipo (serían fugas). Se resuelve aparte.
  if (session.role === "cliente") return getClienteChatList(session);
  const isAdmin = session.role === "admin";
  // Canales de equipo por rol («Equipo · Editor»): se crean/sincronizan al cargar el rail.
  try {
    await ensureRoleChannels();
  } catch {
    // best-effort: el rail carga aunque la sincronización falle (p. ej. BD sin migrar).
  }
  // El rail muestra: canales donde soy miembro (DMs, grupos, chats a los que me uní) Y, además,
  // los chats de PROYECTO/CLIENTE que PUEDO ver aunque no me hayan invitado al canal: admin ve
  // todos; si soy líder o miembro del proyecto, el suyo; y los públicos. Así cada proyecto tiene
  // su chat visible en la pestaña Chats (antes solo aparecía si te habían invitado al canal).
  const channelAccess: Prisma.ChatChannelWhereInput[] = isAdmin
    ? [{ type: { in: ["PROJECT", "CLIENT"] } }]
    : [
        { type: { in: ["PROJECT", "CLIENT"] }, isPublic: true },
        { type: "PROJECT", project: { leadId: session.id } },
        { type: "PROJECT", project: { members: { some: { userId: session.id } } } },
      ];
  const [myChannels, publicChannels, team] = await Promise.all([
    db.chatChannel.findMany({
      where: { OR: [{ members: { some: { userId: session.id } } }, ...channelAccess] },
      orderBy: { createdAt: "desc" },
      include: {
        members: { include: { user: { select: { id: true, name: true, initials: true, avatarColor: true, isSystemBot: true, presence: true, dndUntil: true } } } },
        _count: { select: { messages: true } },
        // Para agrupar por cliente: canal de cliente (clientId directo) o de proyecto (→ su cliente).
        client: { select: { id: true, name: true, emoji: true } },
        project: { select: { client: { select: { id: true, name: true, emoji: true } } } },
      },
    }),
    db.chatChannel.findMany({
      where: { type: "GENERAL", isPublic: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, section: true },
    }),
    db.user.findMany({ where: { active: true, NOT: { id: session.id } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // El "Chat del día" puede no estar en myChannels (no-miembro): se incluye en las consultas
  // por id para que su badge y su actividad funcionen igual.
  const allIds = [...new Set([...myChannels.map((c) => c.id), ...publicChannels.map((c) => c.id)])];
  const [unread, lastMap, states, mentionNotifs] = await Promise.all([
    unreadByChannel(session.id, allIds),
    lastMessageByChannel(allIds),
    db.userChannelState
      .findMany({ where: { userId: session.id }, select: { channelId: true, pinnedAt: true, notifyLevel: true } })
      .catch(() => [] as { channelId: string; pinnedAt: Date | null; notifyLevel: string | null }[]), // BD sin migrar: rail sin fijados/niveles
    // Menciones @ SIN leer, por canal: notificaciones type "mention" no leídas; el canal se extrae
    // del link «/chat/<id>?msg=…». Señal alta para priorizar y para el filtro «Menciones».
    db.notification
      .findMany({ where: { userId: session.id, type: "mention", read: false }, select: { link: true } })
      .catch(() => [] as { link: string | null }[]),
  ]);
  const mentionsByChannel = new Map<string, number>();
  for (const n of mentionNotifs) {
    const m = n.link?.match(/\/chat\/([^/?#]+)/);
    if (m) mentionsByChannel.set(m[1], (mentionsByChannel.get(m[1]) ?? 0) + 1);
  }
  const mentionsOf = (channelId: string) => mentionsByChannel.get(channelId) ?? 0;
  const pinnedAtOf = new Map(states.filter((s) => s.pinnedAt).map((s) => [s.channelId, s.pinnedAt!.getTime()] as const));
  const levelOf = new Map(states.filter((s) => s.notifyLevel).map((s) => [s.channelId, s.notifyLevel!] as const));
  // Silenciado efectivo de una fila del rail: el nivel explícito manda (también existe para el
  // admin sin membresía); sin nivel, el muted heredado de la membresía.
  const mutedOf = (channelId: string, memberMuted: boolean) => {
    const level = levelOf.get(channelId);
    return level ? level !== "all" : memberMuted;
  };

  const dms: ChatListRow[] = myChannels
    // Solo DMs con un interlocutor que todavía existe y que NO sea un bot del sistema
    // (el chat de Marcebot se eliminó; su DM histórico queda oculto). Si la otra persona
    // fue borrada, su membresía desaparece en cascada y el DM huérfano se oculta.
    .filter(
      (c) =>
        c.type === "DIRECT" &&
        c.members.some((m) => m.user.id !== session.id) &&
        !c.members.some((m) => m.user.isSystemBot),
    )
    .map((c) => {
      const other = c.members.find((m) => m.user.id !== session.id)?.user;
      return {
        id: c.id,
        name: other?.name ?? c.name,
        initials: other?.initials ?? null,
        color: other?.avatarColor ?? null,
        isPublic: c.isPublic,
        isDM: true,
        otherPresence: other?.presence ?? null,
        otherDnd: isDndActive(other?.dndUntil ?? null),
        unread: unread.get(c.id) ?? 0,
        mentions: mentionsOf(c.id),
        muted: mutedOf(c.id, c.members.find((m) => m.userId === session.id)?.muted ?? false),
        pinned: pinnedAtOf.has(c.id),
        kind: null,
        ...previewOf(lastMap.get(c.id), session.name),
        meta: `${c._count.messages} msj.`,
      };
    })
    .sort((a, b) => activityOf(b) - activityOf(a));

  // "Chat del día" (canal de sistema "estados-equipo") se fija aparte arriba; se excluye de
  // las listas normales para no duplicarlo.
  const dailyRow = publicChannels.find((c) => c.slug === "estados-equipo") ?? null;
  const dailyId = dailyRow?.id ?? null;
  const daily = { channelId: dailyId, name: dailyRow?.name ?? "Chat del día", unread: dailyId ? unread.get(dailyId) ?? 0 : 0 };

  // Canales no-DM (sin el "Chat del día"): se separan en chats CON cliente (agrupados por
  // cliente) y GRUPOS sin cliente (equipos por rol, canales de equipo, etc.).
  const groupChannels = myChannels.filter((c) => c.type !== "DIRECT" && c.id !== dailyId);
  const rowOf = (c: (typeof groupChannels)[number]): ChatListRow => {
    // UN solo canal por proyecto: el chip «proyecto» (kind "interno" heredado) cubre todos los
    // canales de proyecto; ya no existe la variante «con el cliente».
    const kind = c.roleKey
      ? "equipo"
      : c.type === "CLIENT"
        ? "cuenta"
        : c.type === "PROJECT"
          ? "interno"
          : null;
    return {
      id: c.id,
      name: c.name,
      initials: null,
      color: null,
      isPublic: c.isPublic,
      isDM: false,
      unread: unread.get(c.id) ?? 0,
      mentions: mentionsOf(c.id),
      muted: mutedOf(c.id, c.members.find((m) => m.userId === session.id)?.muted ?? false),
      pinned: pinnedAtOf.has(c.id),
      kind,
      ...previewOf(lastMap.get(c.id), session.name),
      meta: `${c.members.length} miembros`,
    };
  };

  const clientMap = new Map<string, ChatClientGroup>();
  const groups: ChatListRow[] = [];
  for (const c of groupChannels) {
    const client = c.client ?? c.project?.client ?? null;
    if (!client) {
      groups.push(rowOf(c));
      continue;
    }
    let g = clientMap.get(client.id);
    if (!g) {
      g = { clientId: client.id, clientName: client.name, emoji: client.emoji, channels: [], unread: 0 };
      clientMap.set(client.id, g);
    }
    g.channels.push(rowOf(c));
  }

  // Fijados: salen de su sección y van arriba (con el cliente como contexto en `meta`),
  // ordenados por cuándo se fijaron (lo último fijado primero).
  const pinned: ChatListRow[] = [];
  const unpinnedOf = (rows: ChatListRow[], context?: string) =>
    rows.filter((r) => {
      if (!r.pinned) return true;
      pinned.push(context ? { ...r, meta: context } : r);
      return false;
    });
  const dmsOut = unpinnedOf(dms);
  const groupsOut = unpinnedOf(groups).sort((a, b) => activityOf(b) - activityOf(a));
  for (const g of clientMap.values()) {
    g.channels = unpinnedOf(g.channels, g.clientName).sort((a, b) => activityOf(b) - activityOf(a));
    g.unread = g.channels.reduce((n, r) => n + (r.muted ? 0 : r.unread), 0);
  }
  pinned.sort((a, b) => (pinnedAtOf.get(b.id) ?? 0) - (pinnedAtOf.get(a.id) ?? 0));
  // Grupos de cliente por actividad (el cliente con lo más reciente arriba); sin mensajes, alfabético.
  const groupActivity = (g: ChatClientGroup) => Math.max(0, ...g.channels.map(activityOf));
  const clientGroups = [...clientMap.values()]
    .filter((g) => g.channels.length > 0)
    .sort((a, b) => groupActivity(b) - groupActivity(a) || a.clientName.localeCompare(b.clientName));

  const myChannelIds = new Set(myChannels.map((c) => c.id));
  // Un grupo asignado a una SECCIÓN no se ofrece en "Explorar" a quien no tiene acceso a esa sección
  // (además de que canAccessChannel bloquea el join): ni siquiera se descubre.
  const explore = publicChannels
    .filter((c) => !myChannelIds.has(c.id) && c.id !== dailyId && (!c.section || sessionHasSectionAccess(c.section, session)))
    .map((c) => ({ id: c.id, name: c.name }));

  return { daily, pinned, dms: dmsOut, clientGroups, groups: groupsOut, explore, team };
});

// Rail de chats del PORTAL DEL CLIENTE: SOLO los canales de proyecto donde es miembro (para hablar
// con el equipo), agrupados por su cliente. Sin canales públicos, DMs, explorar ni lista del equipo.
async function getClienteChatList(session: SessionUser): Promise<ChatListData> {
  // Asegura (y migra, si venía la pareja vieja) el canal ÚNICO de cada proyecto del invitado.
  const myProjects = await db.projectMember.findMany({ where: { userId: session.id }, select: { projectId: true } });
  await Promise.all(myProjects.map((m) => ensureProjectChannels(m.projectId)));

  const channels = await db.chatChannel.findMany({
    // UN solo chat por proyecto: el invitado ve el canal de cada proyecto donde es miembro.
    where: { type: "PROJECT", project: { members: { some: { userId: session.id } } } },
    orderBy: { createdAt: "desc" },
    include: {
      members: { select: { userId: true, muted: true } },
      project: { select: { client: { select: { id: true, name: true, emoji: true } } } },
    },
  });
  const ids = channels.map((c) => c.id);
  const [unread, lastMap, states] = await Promise.all([
    unreadByChannel(session.id, ids),
    lastMessageByChannel(ids),
    db.userChannelState
      .findMany({ where: { userId: session.id, pinnedAt: { not: null } }, select: { channelId: true, pinnedAt: true } })
      .catch(() => [] as { channelId: string; pinnedAt: Date | null }[]),
  ]);
  const pinnedAtOf = new Map(states.map((s) => [s.channelId, s.pinnedAt ? s.pinnedAt.getTime() : 0] as const));

  const pinned: ChatListRow[] = [];
  const clientMap = new Map<string, ChatClientGroup>();
  const groups: ChatListRow[] = [];
  for (const c of channels) {
    const row: ChatListRow = {
      id: c.id,
      name: c.name,
      initials: null,
      color: null,
      isPublic: c.isPublic,
      isDM: false,
      unread: unread.get(c.id) ?? 0,
      mentions: 0, // el portal del cliente no usa priorización por menciones
      muted: c.members.find((m) => m.userId === session.id)?.muted ?? false,
      pinned: pinnedAtOf.has(c.id),
      kind: null, // el invitado solo tiene chats con el equipo: el chip no aporta
      ...previewOf(lastMap.get(c.id), session.name),
      meta: `${c.members.length} miembros`,
    };
    const client = c.project?.client ?? null;
    if (row.pinned) { pinned.push(client ? { ...row, meta: client.name } : row); continue; }
    if (!client) { groups.push(row); continue; }
    let g = clientMap.get(client.id);
    if (!g) { g = { clientId: client.id, clientName: client.name, emoji: client.emoji, channels: [], unread: 0 }; clientMap.set(client.id, g); }
    g.channels.push(row);
    g.unread += row.muted ? 0 : row.unread;
  }
  pinned.sort((a, b) => (pinnedAtOf.get(b.id) ?? 0) - (pinnedAtOf.get(a.id) ?? 0));
  for (const g of clientMap.values()) g.channels.sort((a, b) => activityOf(b) - activityOf(a));
  const clientGroups = [...clientMap.values()].filter((g) => g.channels.length > 0).sort((a, b) => a.clientName.localeCompare(b.clientName));

  return {
    daily: { channelId: null, name: "Chat del día", unread: 0 },
    pinned,
    dms: [],
    clientGroups,
    groups,
    explore: [],
    team: [],
  };
}
