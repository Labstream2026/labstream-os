import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessChannel } from "@/lib/chat-access";
import { getOrCreateClientChannel } from "@/lib/client-chat";
import { isEditableOffice } from "@/lib/onlyoffice";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Resuelve el canal que muestra el panel de chat de la derecha:
//   ?project=<id>  → canal (privado) de ese proyecto
//   ?dm=<userId>   → mensaje directo con esa persona (lo crea si no existe)
// Devuelve el canal + sus mensajes ya con la forma que espera ChannelChat.
const messageInclude = {
  // Los 100 MÁS RECIENTES (desc); shape() los re-invierte a orden cronológico. Con asc+take:100
  // se devolvían los 100 más VIEJOS y los nuevos no llegaban al panel en canales largos.
  orderBy: { createdAt: "desc" as const },
  take: 100,
  include: {
    author: { select: { name: true, initials: true, avatarColor: true } },
    attachments: true,
    reactions: { select: { emoji: true, userId: true } },
    poll: {
      include: {
        options: { orderBy: { position: "asc" as const }, include: { _count: { select: { votes: true } } } },
      },
    },
  },
};

type RawMessage = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: Date;
  pinned: boolean;
  editedAt: Date | null;
  deletedAt: Date | null;
  author: { name: string; initials: string | null; avatarColor: string | null } | null;
  attachments: { id: string; name: string; mime: string | null }[];
  reactions: { emoji: string; userId: string }[];
  poll: { id: string; question: string; options: { id: string; text: string; _count: { votes: number } }[] } | null;
};

function shape(messages: RawMessage[], myVotes: Map<string, string>) {
  // messageInclude trae desc (recientes primero); re-invertimos a orden cronológico ascendente.
  return [...messages].reverse().map((m) => ({
    id: m.id,
    body: m.body,
    parentId: m.parentId,
    deleted: !!m.deletedAt,
    createdAt: m.createdAt.toISOString(),
    pinned: m.pinned,
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    author: m.author ? { name: m.author.name, initials: m.author.initials, color: m.author.avatarColor } : null,
    attachments: m.attachments.map((a) => ({ id: a.id, name: a.name, mime: a.mime, editable: isEditableOffice(a.name) })),
    reactions: m.reactions.map((r) => ({ emoji: r.emoji, userId: r.userId })),
    poll: m.poll
      ? {
          id: m.poll.id,
          question: m.poll.question,
          options: m.poll.options.map((o) => ({ id: o.id, text: o.text, votes: o._count.votes })),
          totalVotes: m.poll.options.reduce((n, o) => n + o._count.votes, 0),
        }
      : null,
    myOptionId: m.poll ? myVotes.get(m.poll.id) ?? null : null,
  }));
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauth" }, { status: 401 });
  // El PORTAL CLIENTE no usa el dock de chat del equipo (DMs / canales de cliente). Su único chat
  // es el de SU proyecto, vía /chat. Sin este guard, un cliente podía crear/abrir un DM con
  // cualquier persona del equipo llamando directo a ?dm=<id>.
  if (session.role === "cliente") return NextResponse.json({ channel: null, canAccess: false, messages: [] });
  // El admin ve los mensajes borrados (en gris) para seguimiento; los demás no.
  const adminAll = session.role === "admin";
  const msgWhere = (channelId: string) => ({ channelId, ...(adminAll ? {} : { deletedAt: null }) });

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project");
  const clientId = url.searchParams.get("client");
  const dmUserId = url.searchParams.get("dm");

  // ── Mensaje directo ──────────────────────────────────────────────
  if (dmUserId) {
    if (dmUserId === session.id) return NextResponse.json({ channel: null, canAccess: false, messages: [] });
    const other = await db.user.findUnique({ where: { id: dmUserId }, select: { id: true, name: true, active: true, isSystemBot: true } });
    if (!other?.active) return NextResponse.json({ channel: null, canAccess: false, messages: [] });
    // Los bots del sistema (p. ej. Marcebot) no son destinos de DM válidos: no se
    // abre ni se crea un canal hacia ellos desde un GET.
    if (other.isSystemBot) return NextResponse.json({ channel: null, canAccess: false, messages: [] });

    let channel = await db.chatChannel.findFirst({
      where: {
        type: "DIRECT",
        AND: [{ members: { some: { userId: session.id } } }, { members: { some: { userId: dmUserId } } }],
      },
      select: { id: true },
    });
    if (!channel) {
      channel = await db.chatChannel.create({
        data: {
          type: "DIRECT",
          name: other.name,
          isPublic: false,
          members: { create: [{ userId: session.id }, { userId: dmUserId }] },
        },
        select: { id: true },
      });
    }
    const [messages, votes] = await Promise.all([
      db.chatMessage.findMany({ where: msgWhere(channel.id), ...messageInclude }),
      db.pollVote.findMany({ where: { userId: session.id, poll: { channelId: channel.id } }, select: { pollId: true, optionId: true } }),
    ]);
    const myVotes = new Map(votes.map((v) => [v.pollId, v.optionId] as const));
    return NextResponse.json({
      channel: { id: channel.id, name: other.name, type: "DIRECT", isPublic: false, canManage: false, members: [] },
      canAccess: true,
      messages: shape(messages as RawMessage[], myVotes),
    });
  }

  // ── Canal de proyecto ────────────────────────────────────────────
  if (projectId) {
    const channel = await db.chatChannel.findFirst({
      where: { projectId },
      include: {
        project: { select: { leadId: true } },
        members: { include: { user: { select: { id: true, name: true, initials: true, avatarColor: true } } } },
      },
    });
    if (!channel) return NextResponse.json({ channel: null, canAccess: false, messages: [] });

    const canAccess = canAccessChannel(
      { isPublic: channel.isPublic, project: channel.project, members: channel.members.map((m) => ({ userId: m.userId })) },
      session,
    );
    const canManage =
      session.role === "admin" ||
      channel.project?.leadId === session.id ||
      channel.members.some((m) => m.userId === session.id && m.role === "ADMIN");

    const payload = {
      channel: {
        id: channel.id,
        name: channel.name,
        type: "PROJECT",
        isPublic: channel.isPublic,
        canManage,
        members: channel.members.map((m) => ({ id: m.user.id, name: m.user.name, initials: m.user.initials, color: m.user.avatarColor, role: m.role })),
      },
      canAccess,
      messages: [] as ReturnType<typeof shape>,
    };
    if (!canAccess) return NextResponse.json(payload);

    const [messages, votes] = await Promise.all([
      db.chatMessage.findMany({ where: msgWhere(channel.id), ...messageInclude }),
      db.pollVote.findMany({ where: { userId: session.id, poll: { channelId: channel.id } }, select: { pollId: true, optionId: true } }),
    ]);
    const myVotes = new Map(votes.map((v) => [v.pollId, v.optionId] as const));
    payload.messages = shape(messages as RawMessage[], myVotes);
    return NextResponse.json(payload);
  }

  // ── Canal de cliente (reúne a todos los de sus proyectos) ────────
  if (clientId) {
    const chId = await getOrCreateClientChannel(clientId); // crea y sincroniza miembros
    if (!chId) return NextResponse.json({ channel: null, canAccess: false, messages: [] });
    const channel = await db.chatChannel.findUnique({
      where: { id: chId },
      include: { members: { include: { user: { select: { id: true, name: true, initials: true, avatarColor: true } } } } },
    });
    if (!channel) return NextResponse.json({ channel: null, canAccess: false, messages: [] });

    const canAccess = session.role === "admin" || channel.members.some((m) => m.userId === session.id);
    const payload = {
      channel: {
        id: channel.id,
        name: channel.name,
        type: "CLIENT",
        isPublic: channel.isPublic,
        canManage: false, // la membresía se sincroniza con los proyectos del cliente
        members: channel.members.map((m) => ({ id: m.user.id, name: m.user.name, initials: m.user.initials, color: m.user.avatarColor, role: m.role })),
      },
      canAccess,
      messages: [] as ReturnType<typeof shape>,
    };
    if (!canAccess) return NextResponse.json(payload);

    const [messages, votes] = await Promise.all([
      db.chatMessage.findMany({ where: msgWhere(channel.id), ...messageInclude }),
      db.pollVote.findMany({ where: { userId: session.id, poll: { channelId: channel.id } }, select: { pollId: true, optionId: true } }),
    ]);
    const myVotes = new Map(votes.map((v) => [v.pollId, v.optionId] as const));
    payload.messages = shape(messages as RawMessage[], myVotes);
    return NextResponse.json(payload);
  }

  return NextResponse.json({ channel: null, canAccess: false, messages: [] });
}
