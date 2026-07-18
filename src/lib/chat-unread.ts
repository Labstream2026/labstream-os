import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessChannel } from "@/lib/chat-access";
import type { SessionUser } from "@/lib/session";

// Contabilidad ÚNICA de mensajes de chat no leídos. La usan el rail de /chat, el badge global
// del sidebar/bottom-nav (layout) y el stream global /api/chat/stream, para que los tres números
// cuadren siempre (antes el layout contaba distinto: sin GREATEST con UserChannelState y sin
// excluir silenciados, así que silenciar un canal no bajaba el badge rojo).

// No leídos por canal: mensajes RAÍZ de otros posteriores a mi última lectura. Para MIEMBROS la
// lectura vive en ChannelMember.lastReadAt (sin fila de lectura previa cuenta TODO, como
// siempre). Para quien VE el canal SIN membresía (el admin: la membresía la sincroniza el
// proyecto/rol y no se puede crear a mano) la lectura vive en UserChannelState.lastReadAt y
// el conteo EMPIEZA al abrir el canal la primera vez (sin fila → 0, no una avalancha de
// badges históricos el día del despliegue).
//
// El conteo por canal se CAPA en 100 (LATERAL + LIMIT): el badge muestra «99+» de todos modos,
// y sin tope un canal nunca abierto re-agregaba TODO su historial en cada recount del stream.
export async function unreadByChannel(userId: string, channelIds: string[]): Promise<Map<string, number>> {
  if (channelIds.length === 0) return new Map();
  // Para un MIEMBRO manda la lectura más RECIENTE de las dos: si venía leyendo el canal sin
  // membresía (admin con UserChannelState) y lo suman al equipo, su historial ya leído no
  // reaparece como no leído (ChannelMember nace con lastReadAt NULL).
  const rows = await db.$queryRaw<{ channelId: string; count: bigint }[]>`
    SELECT c.id AS "channelId", cnt.count AS count
    FROM unnest(ARRAY[${Prisma.join(channelIds)}]) AS c(id)
    LEFT JOIN "ChannelMember" cm ON cm."channelId" = c.id AND cm."userId" = ${userId}
    LEFT JOIN "UserChannelState" ucs ON ucs."channelId" = c.id AND ucs."userId" = ${userId}
    JOIN LATERAL (
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT 1
        FROM "ChatMessage" m
        WHERE m."channelId" = c.id
          AND m."parentId" IS NULL
          AND m."deletedAt" IS NULL
          AND (m."authorId" IS NULL OR m."authorId" <> ${userId})
          AND (
            (cm."userId" IS NOT NULL AND m."createdAt" > GREATEST(COALESCE(cm."lastReadAt", 'epoch'::timestamp), COALESCE(ucs."lastReadAt", 'epoch'::timestamp)))
            OR (cm."userId" IS NULL AND ucs."lastReadAt" IS NOT NULL AND m."createdAt" > ucs."lastReadAt")
          )
        LIMIT 100
      ) t
    ) cnt ON true
    WHERE cnt.count > 0
  `.catch(() => [] as { channelId: string; count: bigint }[]); // BD sin migrar (UserChannelState aún no existe): rail sin badges > rail caído
  return new Map(rows.map((r) => [r.channelId, Number(r.count)] as const));
}

export type ChatUnreadRow = { channelId: string; count: number; muted: boolean };
export type ChatUnreadSummary = {
  total: number; // no leídos SIN silenciados (el número del badge global)
  rows: ChatUnreadRow[]; // solo canales con count > 0 (silenciados incluidos, marcados)
  // Canales del usuario (miembro o con estado propio) que ADEMÁS puede ver HOY según
  // canAccessChannel. El stream global filtra el bus con ESTE set: la membresía histórica
  // (o un UserChannelState huérfano de pin/lectura) NO basta — si te sacan del proyecto o
  // pierdes el permiso de la sección, dejas de recibir previews y conteos de ese canal.
  accessibleIds: string[];
};

// Resumen de no-leídos del usuario sobre sus canales VISIBLES HOY. Devuelve null si el
// usuario ya no existe o está desactivado (el stream corta la conexión con eso).
// «Silenciado» con la misma regla que el rail: el nivel explícito de UserChannelState manda
// (también existe para el admin sin membresía); sin nivel, el muted heredado de la membresía.
export async function getChatUnreadSummary(session: SessionUser): Promise<ChatUnreadSummary | null> {
  const [me, memberships, states] = await Promise.all([
    db.user.findUnique({ where: { id: session.id }, select: { active: true } }),
    db.channelMember.findMany({ where: { userId: session.id }, select: { channelId: true, muted: true } }),
    db.userChannelState
      .findMany({ where: { userId: session.id }, select: { channelId: true, notifyLevel: true } })
      .catch(() => [] as { channelId: string; notifyLevel: string | null }[]), // BD sin migrar
  ]);
  if (!me?.active) return null;
  const memberMuted = new Map(memberships.map((m) => [m.channelId, m.muted] as const));
  const levelOf = new Map(states.filter((s) => s.notifyLevel).map((s) => [s.channelId, s.notifyLevel!] as const));
  const ids = [...new Set([...memberships.map((m) => m.channelId), ...states.map((s) => s.channelId)])];

  // Acceso VIGENTE canal por canal (mismas reglas que abrir el canal): cubre expulsiones de
  // proyecto/rol/cliente, secciones cuyo permiso se revocó y filas UserChannelState huérfanas.
  let accessibleIds: string[] = [];
  if (ids.length > 0) {
    const channels = await db.chatChannel.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        isPublic: true,
        audience: true,
        section: true,
        project: { select: { leadId: true, members: { select: { userId: true } } } },
        members: { select: { userId: true } },
      },
    });
    accessibleIds = channels.filter((c) => canAccessChannel(c, session)).map((c) => c.id);
  }

  const counts = await unreadByChannel(session.id, accessibleIds);
  const mutedOf = (channelId: string) => {
    const level = levelOf.get(channelId);
    return level ? level !== "all" : memberMuted.get(channelId) ?? false;
  };
  const rows: ChatUnreadRow[] = [];
  let total = 0;
  for (const [channelId, count] of counts) {
    if (count <= 0) continue;
    const muted = mutedOf(channelId);
    rows.push({ channelId, count, muted });
    if (!muted) total += count;
  }
  return { total, rows, accessibleIds };
}
