import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessChannel } from "@/lib/chat-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// «Mis hilos»: hilos donde el usuario PARTICIPA (escribió el mensaje raíz o una respuesta) y que
// tienen respuestas, con cuántas son NUEVAS desde la última vez que abrió el hilo (ThreadRead).
// Cross-canal, filtrado por los canales que el usuario puede ver HOY (canAccessChannel). Acceso: sesión.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauth" }, { status: 401 });

  // Candidatos: raíces que escribí (con respuestas) + raíces donde respondí.
  const [myRoots, myReplyParents] = await Promise.all([
    db.chatMessage.findMany({
      where: { authorId: session.id, parentId: null, deletedAt: null, replies: { some: { deletedAt: null } } },
      select: { id: true },
      take: 100,
    }),
    db.chatMessage.findMany({
      where: { authorId: session.id, parentId: { not: null }, deletedAt: null },
      select: { parentId: true },
      distinct: ["parentId"],
      take: 200,
    }),
  ]);
  const rootIds = Array.from(
    new Set([...myRoots.map((r) => r.id), ...myReplyParents.map((r) => r.parentId).filter((x): x is string => !!x)]),
  );
  if (rootIds.length === 0) return NextResponse.json({ threads: [], newTotal: 0 });

  // Raíces con lo necesario para filtrar acceso + pintar la ficha.
  const roots = await db.chatMessage.findMany({
    where: { id: { in: rootIds }, deletedAt: null },
    select: {
      id: true,
      body: true,
      createdAt: true,
      channelId: true,
      author: { select: { name: true, initials: true, avatarColor: true } },
      channel: {
        select: {
          name: true,
          isPublic: true,
          audience: true,
          section: true,
          project: { select: { leadId: true, members: { select: { userId: true } } } },
          members: { select: { userId: true } },
        },
      },
    },
  });

  const accessible = roots.filter((r) =>
    canAccessChannel(
      {
        isPublic: r.channel.isPublic,
        audience: r.channel.audience,
        section: r.channel.section,
        project: r.channel.project,
        members: r.channel.members.map((m) => ({ userId: m.userId })),
      },
      session,
    ),
  );
  const accIds = accessible.map((r) => r.id);
  if (accIds.length === 0) return NextResponse.json({ threads: [], newTotal: 0 });

  const [replies, reads] = await Promise.all([
    db.chatMessage.findMany({
      where: { parentId: { in: accIds }, deletedAt: null },
      select: { parentId: true, authorId: true, createdAt: true },
    }),
    db.threadRead.findMany({ where: { userId: session.id, rootId: { in: accIds } }, select: { rootId: true, lastSeenAt: true } }),
  ]);
  const lastSeen = new Map(reads.map((r) => [r.rootId, r.lastSeenAt.getTime()]));

  // Por hilo: total de respuestas, fecha de la última, y cuántas son nuevas (posteriores a la
  // última vez que abrí el hilo y de OTRA persona; sin marca de lectura → todas las ajenas son nuevas).
  const agg = new Map<string, { total: number; latest: number; newCount: number }>();
  for (const rep of replies) {
    const rid = rep.parentId as string;
    const cur = agg.get(rid) ?? { total: 0, latest: 0, newCount: 0 };
    cur.total += 1;
    const t = rep.createdAt.getTime();
    if (t > cur.latest) cur.latest = t;
    if (t > (lastSeen.get(rid) ?? 0) && rep.authorId !== session.id) cur.newCount += 1;
    agg.set(rid, cur);
  }

  const threads = accessible
    .map((r) => {
      const a = agg.get(r.id);
      const latest = a?.latest || r.createdAt.getTime();
      return {
        rootId: r.id,
        channelId: r.channelId,
        channelName: r.channel.name,
        author: r.author ? { name: r.author.name, initials: r.author.initials, color: r.author.avatarColor } : null,
        body: r.body.slice(0, 140),
        totalReplies: a?.total ?? 0,
        newCount: a?.newCount ?? 0,
        latestReplyAt: new Date(latest).toISOString(),
      };
    })
    .filter((t) => t.totalReplies > 0)
    .sort((a, b) => b.latestReplyAt.localeCompare(a.latestReplyAt));

  const newTotal = threads.filter((t) => t.newCount > 0).length;
  return NextResponse.json({ threads, newTotal });
}
