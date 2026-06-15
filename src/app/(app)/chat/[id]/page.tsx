import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessChannel, userCanManageChannel } from "@/lib/chat-access";
import { isEditableOffice } from "@/lib/onlyoffice";
import { ChannelChat } from "@/components/chat/channel-chat";
import { ChannelSettings } from "@/components/chat/channel-settings";
import { JoinLeave } from "./join-leave";
import { Hash, Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const channel = await db.chatChannel.findUnique({
    where: { id },
    include: {
      project: { select: { leadId: true } },
      members: { include: { user: { select: { id: true, name: true, initials: true, avatarColor: true } } } },
      messages: {
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
      },
    },
  });
  if (!channel) notFound();

  // Acceso: público → equipo; privado → admin/responsable/miembro.
  if (!canAccessChannel({ isPublic: channel.isPublic, project: channel.project, members: channel.members }, session)) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-8 py-24 text-center">
        <Lock className="size-7 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Chat privado</h1>
        <p className="text-sm text-muted-foreground">No tienes acceso a este chat. Pídele a un administrador del canal que te invite.</p>
        <Link href="/chat" className="mt-2 text-sm font-medium text-primary hover:underline">← Volver a Chats</Link>
      </div>
    );
  }

  const isDM = channel.type === "DIRECT";
  const other = isDM ? channel.members.find((m) => m.user.id !== session.id)?.user : null;
  const title = isDM ? other?.name ?? channel.name : channel.name;
  const canManage = !isDM && (await userCanManageChannel(id, session));
  const isMember = channel.members.some((m) => m.user.id === session.id);

  const team = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } });

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3 sm:px-6">
        <Link href="/chat" className="text-xs text-muted-foreground hover:text-foreground">← Chats</Link>
        <div className="mt-1 flex items-center gap-2">
          {isDM ? null : channel.isPublic ? <Hash className="size-5 text-muted-foreground" /> : <Lock className="size-5 text-amber-600" />}
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {!isDM && !isMember ? <JoinLeave channelId={id} joined={false} /> : null}
          {!isDM && isMember && !canManage ? <JoinLeave channelId={id} joined={true} /> : null}
        </div>

        {canManage ? (
          <div className="mt-2">
            <ChannelSettings
              channelId={id}
              isPublic={channel.isPublic}
              canManage={canManage}
              members={channel.members.map((m) => ({ id: m.user.id, name: m.user.name, initials: m.user.initials, color: m.user.avatarColor, role: m.role }))}
              team={team.map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.avatarColor }))}
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <ChannelChat
          channelId={id}
          me={{ id: session.id, name: session.name, initials: session.initials, color: session.color }}
          members={team.map((t) => ({ id: t.id, name: t.name }))}
          initialMessages={channel.messages.map((m) => ({
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
