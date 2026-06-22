import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";

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

export type ChatListData = {
  marcebot: { channelId: string | null; unread: number }; // chat directo con el asistente (aparte)
  daily: { channelId: string | null; name: string; unread: number }; // "Chat del día" (canal de equipo), fijado aparte
  dms: ChatListRow[];
  channels: ChatListRow[];
  explore: { id: string; name: string }[];
  team: { id: string; name: string }[];
};

export async function getChatListData(session: SessionUser): Promise<ChatListData> {
  const [myChannels, publicChannels, team] = await Promise.all([
    db.chatChannel.findMany({
      where: { members: { some: { userId: session.id } } },
      orderBy: { createdAt: "desc" },
      include: {
        members: { include: { user: { select: { id: true, name: true, initials: true, avatarColor: true, isSystemBot: true } } } },
        _count: { select: { messages: true } },
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

  const channels: ChatListRow[] = myChannels
    .filter((c) => c.type !== "DIRECT" && c.id !== dailyId)
    .map((c) => ({
      id: c.id,
      name: c.name,
      initials: null,
      color: null,
      isPublic: c.isPublic,
      isDM: false,
      unread: unread.get(c.id) ?? 0,
      meta: `${c.members.length} miembros`,
    }));

  const myChannelIds = new Set(myChannels.map((c) => c.id));
  const explore = publicChannels.filter((c) => !myChannelIds.has(c.id) && c.id !== dailyId).map((c) => ({ id: c.id, name: c.name }));

  return { marcebot, daily, dms, channels, explore, team };
}
