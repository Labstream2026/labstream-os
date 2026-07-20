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
      quoted: { select: { id: true, body: true, deletedAt: true, author: { select: { name: true } } } },
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

type QuotedRow = { id: string; body: string; deletedAt: Date | null; author: { name: string } | null } | null;
type Row = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: Date;
  pinned: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  author: { name: string; initials: string | null; avatarColor: string | null } | null;
  quoted: QuotedRow;
  attachments: { id: string; name: string; mime: string | null; fileAssetId: string | null }[];
  reactions: { emoji: string; userId: string }[];
  poll: { id: string; question: string; options: { id: string; text: string; _count: { votes: number } }[]; votes: { optionId: string }[] } | null;
};

// Vista previa del citado (compartida con el shape del dock/layout): autor + snippet; borrado → null.
export function quotedPreview(q: QuotedRow) {
  if (!q || q.deletedAt) return null;
  return { id: q.id, author: q.author?.name ?? null, body: q.body.slice(0, 160) };
}

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
    quoted: quotedPreview(m.quoted),
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

  const url = new URL(req.url);
  const searchQ = (url.searchParams.get("q") ?? "").trim();
  const around = url.searchParams.get("around");
  const after = parseDate(url.searchParams.get("after"));
  const before = parseDate(url.searchParams.get("before"));
  const take = Math.min(Math.max(Number(url.searchParams.get("take")) || (before ? 50 : 100), 1), MAX_TAKE);

  // Los borrados no se devuelven a nadie (tampoco al admin): su contenido queda en Auditoría.
  const base = { channelId, deletedAt: null };
  const inc = buildInclude(session.id);

  // BÚSQUEDA en el historial COMPLETO del canal (texto del cuerpo, sin distinguir mayúsculas): antes
  // solo se filtraban los mensajes ya cargados en el cliente, así que lo viejo era imposible de
  // encontrar. Devuelve las coincidencias recientes primero; el cliente las lista y, al hacer clic,
  // salta con contexto (?around=). Nunca incluye borrados (buscar en borrados confunde, aun de admin).
  if (searchQ) {
    const found = (await db.chatMessage.findMany({
      where: { channelId, deletedAt: null, body: { contains: searchQ, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      ...inc,
    })) as unknown as Row[];
    return NextResponse.json({ results: shape(found) });
  }

  // VENTANA alrededor de un mensaje (para SALTAR a un resultado de búsqueda que aún no está cargado):
  // el mensaje objetivo + un puñado antes y después, en orden cronológico. El cliente los fusiona en
  // su lista y hace scroll hasta él. hasMore=false: la carga infinita sigue trayendo lo anterior sola.
  if (around) {
    const target = await db.chatMessage.findFirst({ where: { ...base, id: around }, select: { createdAt: true } });
    if (!target) return NextResponse.json({ messages: [], hasMore: false });
    const [older, fromTarget] = await Promise.all([
      db.chatMessage.findMany({ where: { ...base, createdAt: { lt: target.createdAt } }, orderBy: { createdAt: "desc" }, take: 25, ...inc }),
      db.chatMessage.findMany({ where: { ...base, createdAt: { gte: target.createdAt } }, orderBy: { createdAt: "asc" }, take: 26, ...inc }),
    ]);
    const windowRows = [...(older as unknown as Row[]).reverse(), ...(fromTarget as unknown as Row[])];
    return NextResponse.json({ messages: shape(windowRows), hasMore: false });
  }

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
