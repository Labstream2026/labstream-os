import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isEditableOffice } from "@/lib/onlyoffice";
import { ChannelChat } from "@/components/chat/channel-chat";

export const dynamic = "force-dynamic";

// "Chat del día": conversación del día a día del equipo (cosas sin seguimiento,
// ej. "hoy reunión a las 2"). Reusa el canal de equipo y el chat en tiempo real.
export default async function ChatDelDiaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Canal del día a día (slug estable creado en el seed). Si no existe, se crea.
  let channel = await db.chatChannel.findUnique({ where: { slug: "estados-equipo" } });
  if (!channel) {
    channel = await db.chatChannel.create({
      data: { type: "GENERAL", slug: "estados-equipo", name: "Chat del día", isPublic: true },
    });
  }

  const team = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const messages = await db.chatMessage.findMany({
    where: { channelId: channel.id },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      author: { select: { name: true, initials: true, avatarColor: true } },
      attachments: true,
      reactions: { select: { emoji: true, userId: true } },
      poll: {
        include: {
          options: { orderBy: { position: "asc" }, include: { _count: { select: { votes: true } } } },
          votes: { where: { userId: session.id }, select: { optionId: true } },
        },
      },
    },
  });

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-4 sm:px-8 sm:py-6">
      <div className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight">💬 Chat del día</h1>
        <p className="text-sm text-muted-foreground">
          Lo del día a día del equipo (sin seguimiento): recordatorios, reuniones, avisos rápidos.
        </p>
      </div>

      <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card">
        <ChannelChat
          channelId={channel.id}
          me={{ id: session.id, name: session.name, initials: session.initials, color: session.color }}
          members={team}
          initialMessages={messages.map((m) => ({
            id: m.id,
            body: m.body,
            parentId: m.parentId,
            createdAt: m.createdAt.toISOString(),
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
            myOptionId: m.poll?.votes[0]?.optionId ?? null,
          }))}
        />
      </div>
    </div>
  );
}
