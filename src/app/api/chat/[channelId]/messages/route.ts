import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { userCanAccessChannel } from "@/lib/chat-access";
import { isEditableOffice } from "@/lib/onlyoffice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Lectura incremental de mensajes de un canal, en orden cronológico ascendente:
//   ?after=<ISO>   → mensajes posteriores a esa fecha (CATCH-UP al (re)conectar el SSE / volver a la pestaña).
//   ?before=<ISO>  → mensajes anteriores (PAGINACIÓN "cargar mensajes anteriores"); devuelve hasMore.
//   (sin params)   → los más recientes.
// El SSE (bus en memoria) puede perder mensajes durante un corte/segundo plano; este endpoint deja
// que el cliente reconcilie con la BD sin recargar la página. Acceso: misma regla que ver el canal.

const MAX_TAKE = 200;

function buildInclude(userId: string) {
  return {
    include: {
      author: { select: { name: true, initials: true, avatarColor: true } },
      attachments: true,
      reactions: { select: { emoji: true, userId: true } },
      poll: {
        include: {
          options: { orderBy: { position: "asc" as const }, include: { _count: { select: { votes: true } } } },
          votes: { where: { userId }, select: { optionId: true } },
        },
      },
    },
  };
}

type Row = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: Date;
  pinned: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  author: { name: string; initials: string | null; avatarColor: string | null } | null;
  attachments: { id: string; name: string; mime: string | null; fileAssetId: string | null }[];
  reactions: { emoji: string; userId: string }[];
  poll: { id: string; question: string; options: { id: string; text: string; _count: { votes: number } }[]; votes: { optionId: string }[] } | null;
};

function shape(rows: Row[]) {
  return rows.map((m) => ({
    id: m.id,
    body: m.body,
    parentId: m.parentId,
    deleted: !!m.deletedAt,
    createdAt: m.createdAt.toISOString(),
    pinned: m.pinned,
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    author: m.author ? { name: m.author.name, initials: m.author.initials, color: m.author.avatarColor } : null,
    attachments: m.attachments.map((a) => ({ id: a.id, name: a.name, mime: a.mime, editable: isEditableOffice(a.name), fileAssetId: a.fileAssetId })),
    reactions: m.reactions.map((r) => ({ emoji: r.emoji, userId: r.userId })),
    poll: m.poll
      ? {
          id: m.poll.id,
          question: m.poll.question,
          options: m.poll.options.map((o) => ({ id: o.id, text: o.text, votes: o._count.votes })),
          totalVotes: m.poll.options.reduce((n, o) => n + o._count.votes, 0),
        }
      : null,
    myOptionId: m.poll?.votes[0]?.optionId ?? null,
  }));
}

function parseDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userCanAccessChannel(channelId, session))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const isAdmin = session.role === "admin"; // el admin ve los borrados (en gris) para seguimiento
  const url = new URL(req.url);
  const after = parseDate(url.searchParams.get("after"));
  const before = parseDate(url.searchParams.get("before"));
  const take = Math.min(Math.max(Number(url.searchParams.get("take")) || (before ? 50 : 100), 1), MAX_TAKE);

  const base = { channelId, ...(isAdmin ? {} : { deletedAt: null }) };
  const inc = buildInclude(session.id);

  let rows: Row[];
  let hasMore = false;
  if (after) {
    // Posteriores a `after`, en orden cronológico (asc).
    rows = (await db.chatMessage.findMany({ where: { ...base, createdAt: { gt: after } }, orderBy: { createdAt: "asc" }, take, ...inc })) as unknown as Row[];
  } else if (before) {
    // Anteriores a `before`: traemos take+1 en desc para saber si hay más, recortamos y re-invertimos a asc.
    const got = (await db.chatMessage.findMany({ where: { ...base, createdAt: { lt: before } }, orderBy: { createdAt: "desc" }, take: take + 1, ...inc })) as unknown as Row[];
    hasMore = got.length > take;
    rows = got.slice(0, take).reverse();
  } else {
    const got = (await db.chatMessage.findMany({ where: base, orderBy: { createdAt: "desc" }, take, ...inc })) as unknown as Row[];
    rows = got.reverse();
  }

  return NextResponse.json({ messages: shape(rows), hasMore });
}
