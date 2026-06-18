import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { MARCEBOT_EMAIL } from "@/lib/marcebot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mensajes de Marcebot que el usuario AÚN no ha leído (para el aviso flotante).
// Si los hay, el cliente muestra el popup; al pulsar «Listo» se marca el canal como
// leído y dejan de aparecer hasta el próximo mensaje del bot.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ channelId: null, messages: [] });

  const bot = await db.user.findUnique({ where: { email: MARCEBOT_EMAIL }, select: { id: true } });
  if (!bot) return NextResponse.json({ channelId: null, messages: [] });

  const channel = await db.chatChannel.findFirst({
    where: { type: "DIRECT", AND: [{ members: { some: { userId: bot.id } } }, { members: { some: { userId: session.id } } }] },
    select: { id: true, members: { where: { userId: session.id }, select: { lastReadAt: true } } },
  });
  if (!channel) return NextResponse.json({ channelId: null, messages: [] });

  const lastRead = channel.members[0]?.lastReadAt ?? new Date(0);
  const rows = await db.chatMessage.findMany({
    where: { channelId: channel.id, authorId: bot.id, deletedAt: null, createdAt: { gt: lastRead } },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true, body: true, createdAt: true },
  });

  return NextResponse.json({
    channelId: rows.length ? channel.id : null,
    messages: rows.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt.toISOString() })),
  });
}
