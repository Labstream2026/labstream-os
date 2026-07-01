import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { ensureProjectChannels } from "@/lib/project-chat";

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
  unread: number;
  meta: string; // "N msj." (DM) o "N miembros" (canal)
};

// Un cliente con sus chats (de proyecto + el del propio cliente), para agrupar/colapsar el rail.
export type ChatClientGroup = {
  clientId: string;
  clientName: string;
  emoji: string | null;
  channels: ChatListRow[];
  unread: number; // suma de no-leídos del grupo
};

export type ChatListData = {
  marcebot: { channelId: string | null; unread: number }; // chat directo con el asistente (aparte)
  daily: { channelId: string | null; name: string; unread: number }; // "Chat del día" (canal de equipo), fijado aparte
  dms: ChatListRow[];
  clientGroups: ChatClientGroup[]; // chats agrupados por cliente (colapsables)
  groups: ChatListRow[]; // grupos/canales sin cliente (editores, etc.)
  explore: { id: string; name: string }[];
  team: { id: string; name: string }[];
};

export async function getChatListData(session: SessionUser): Promise<ChatListData> {
  // El PORTAL DEL CLIENTE solo ve el chat de SU(S) proyecto(s): nada de canales públicos, DMs,
  // explorar ni la lista de personas del equipo (serían fugas). Se resuelve aparte.
  if (session.role === "cliente") return getClienteChatList(session);
  const isAdmin = session.role === "admin";
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
        members: { include: { user: { select: { id: true, name: true, initials: true, avatarColor: true, isSystemBot: true } } } },
        _count: { select: { messages: true } },
        // Para agrupar por cliente: canal de cliente (clientId directo) o de proyecto (→ su cliente).
        client: { select: { id: true, name: true, emoji: true } },
        project: { select: { client: { select: { id: true, name: true, emoji: true } } } },
      },
    }),
    db.chatChannel.findMany({
      where: { type: "GENERAL", isPublic: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    db.user.findMany({ where: { active: true, NOT: { id: session.id } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // No leídos por canal: mensajes de otros posteriores a mi última lectura.
  const unreadRows = await db.$queryRaw<{ channelId: string; count: bigint }[]>`
    SELECT m."channelId" AS "channelId", COUNT(*)::bigint AS count
    FROM "ChatMessage" m
    JOIN "ChannelMember" cm ON cm."channelId" = m."channelId" AND cm."userId" = ${session.id}
    WHERE m."parentId" IS NULL
      AND (m."authorId" IS NULL OR m."authorId" <> ${session.id})
      AND m."createdAt" > COALESCE(cm."lastReadAt", 'epoch'::timestamp)
    GROUP BY m."channelId"
  `;
  const unread = new Map(unreadRows.map((r) => [r.channelId, Number(r.count)] as const));

  // El chat con Marcebot (DM con el bot del sistema) se muestra aparte, fijo arriba, no
  // mezclado con los DMs de personas.
  const marcebotDM = myChannels.find(
    (c) => c.type === "DIRECT" && c.members.some((m) => m.user.id !== session.id && m.user.isSystemBot),
  );
  const marcebot = { channelId: marcebotDM?.id ?? null, unread: marcebotDM ? unread.get(marcebotDM.id) ?? 0 : 0 };

  const dms: ChatListRow[] = myChannels
    // Solo DMs con un interlocutor que todavía existe (y que no sea un bot del sistema:
    // Marcebot va aparte). Si la otra persona fue borrada, su membresía desaparece en
    // cascada y el DM queda huérfano (solo yo): se oculta.
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
        unread: unread.get(c.id) ?? 0,
        meta: `${c._count.messages} msj.`,
      };
    });

  // "Chat del día" (canal de sistema "estados-equipo") se fija aparte arriba; se excluye de
  // las listas normales para no duplicarlo.
  const dailyRow = publicChannels.find((c) => c.slug === "estados-equipo") ?? null;
  const dailyId = dailyRow?.id ?? null;
  const daily = { channelId: dailyId, name: dailyRow?.name ?? "Chat del día", unread: dailyId ? unread.get(dailyId) ?? 0 : 0 };

  // Canales no-DM (sin el "Chat del día"): se separan en chats CON cliente (agrupados por
  // cliente) y GRUPOS sin cliente (editores, canales de equipo, etc.).
  const groupChannels = myChannels.filter((c) => c.type !== "DIRECT" && c.id !== dailyId);
  const rowOf = (c: (typeof groupChannels)[number]): ChatListRow => ({
    id: c.id,
    name: c.name,
    initials: null,
    color: null,
    isPublic: c.isPublic,
    isDM: false,
    unread: unread.get(c.id) ?? 0,
    meta: `${c.members.length} miembros`,
  });

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
    const row = rowOf(c);
    g.channels.push(row);
    g.unread += row.unread;
  }
  const clientGroups = [...clientMap.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));

  const myChannelIds = new Set(myChannels.map((c) => c.id));
  const explore = publicChannels.filter((c) => !myChannelIds.has(c.id) && c.id !== dailyId).map((c) => ({ id: c.id, name: c.name }));

  return { marcebot, daily, dms, clientGroups, groups, explore, team };
}

// Rail de chats del PORTAL DEL CLIENTE: SOLO los canales de proyecto donde es miembro (para hablar
// con el equipo), agrupados por su cliente. Sin canales públicos, DMs, explorar ni lista del equipo.
async function getClienteChatList(session: SessionUser): Promise<ChatListData> {
  // Asegura el canal CON EL CLIENTE en cada proyecto del invitado (incluye los que ya existían
  // antes de esta función). Solo crea lo que falte.
  const myProjects = await db.projectMember.findMany({ where: { userId: session.id }, select: { projectId: true } });
  await Promise.all(myProjects.map((m) => ensureProjectChannels(m.projectId)));

  const channels = await db.chatChannel.findMany({
    // El invitado SOLO ve el canal "CLIENT" (con el cliente); nunca el interno del equipo.
    where: { type: "PROJECT", audience: "CLIENT", project: { members: { some: { userId: session.id } } } },
    orderBy: { createdAt: "desc" },
    include: {
      members: { select: { userId: true } },
      project: { select: { client: { select: { id: true, name: true, emoji: true } } } },
    },
  });
  const unreadRows = await db.$queryRaw<{ channelId: string; count: bigint }[]>`
    SELECT m."channelId" AS "channelId", COUNT(*)::bigint AS count
    FROM "ChatMessage" m
    JOIN "ChannelMember" cm ON cm."channelId" = m."channelId" AND cm."userId" = ${session.id}
    WHERE m."parentId" IS NULL
      AND (m."authorId" IS NULL OR m."authorId" <> ${session.id})
      AND m."createdAt" > COALESCE(cm."lastReadAt", 'epoch'::timestamp)
    GROUP BY m."channelId"
  `;
  const unread = new Map(unreadRows.map((r) => [r.channelId, Number(r.count)] as const));

  const clientMap = new Map<string, ChatClientGroup>();
  const groups: ChatListRow[] = [];
  for (const c of channels) {
    const row: ChatListRow = { id: c.id, name: c.name, initials: null, color: null, isPublic: c.isPublic, isDM: false, unread: unread.get(c.id) ?? 0, meta: `${c.members.length} miembros` };
    const client = c.project?.client ?? null;
    if (!client) { groups.push(row); continue; }
    let g = clientMap.get(client.id);
    if (!g) { g = { clientId: client.id, clientName: client.name, emoji: client.emoji, channels: [], unread: 0 }; clientMap.set(client.id, g); }
    g.channels.push(row);
    g.unread += row.unread;
  }
  const clientGroups = [...clientMap.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));

  return {
    marcebot: { channelId: null, unread: 0 },
    daily: { channelId: null, name: "Chat del día", unread: 0 },
    dms: [],
    clientGroups,
    groups,
    explore: [],
    team: [],
  };
}
