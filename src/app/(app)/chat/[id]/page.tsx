import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { canAccessChannel, userCanManageChannel } from "@/lib/chat-access";
import { ensureProjectChannels } from "@/lib/project-chat";
import { isEditableOffice } from "@/lib/onlyoffice";
import { ChannelChat } from "@/components/chat/channel-chat";
import { MuteToggle } from "@/components/chat/mute-toggle";
import { MARCEBOT_EMAIL, MARCEBOT_NAME } from "@/lib/marcebot/bot";
import { ChannelSettings } from "@/components/chat/channel-settings";
import { JoinLeave } from "./join-leave";
import { UserAvatar } from "@/components/user-avatar";
import { Hash, Lock, ChevronLeft, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  // El administrador ve también los mensajes borrados (en gris) para seguimiento;
  // los demás solo ven los no borrados.
  const isAdmin = session.role === "admin";

  const channel = await db.chatChannel.findUnique({
    where: { id },
    include: {
      project: { select: { leadId: true, members: { select: { userId: true } } } },
      members: { include: { user: { select: { id: true, name: true, initials: true, avatarColor: true } } } },
      messages: {
        where: isAdmin ? undefined : { deletedAt: null },
        // Traemos los 100 MÁS RECIENTES (desc) y los re-invertimos a orden cronológico abajo.
        // Con orderBy:"asc"+take:100 Prisma devolvía los 100 más VIEJOS → en chats largos (p. ej.
        // el DM con Marcebot) los mensajes nuevos nunca llegaban al cliente y "no aparecían".
        orderBy: { createdAt: "desc" },
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
  if (!canAccessChannel({ isPublic: channel.isPublic, audience: channel.audience, project: channel.project, members: channel.members }, session)) {
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
  // Bots del sistema (Marcebot): excluidos de los listados de equipo (active:false), pero SÍ se
  // ofrecen en el autocompletado de @menciones del chat para poder etiquetarlos fácil. Van de
  // primeros para que aparezcan arriba al teclear "@".
  // Match robusto: por bandera de sistema, por email canónico o por nombre, para que aparezca
  // aunque el registro de prod no tenga `isSystemBot` puesto o use otro email.
  const bots = await db.user.findMany({ where: { OR: [{ isSystemBot: true }, { email: MARCEBOT_EMAIL }, { name: MARCEBOT_NAME }] }, orderBy: { name: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } });

  // Pestañas de audiencia: en un canal de PROYECTO con dos audiencias (interno del equipo + con el
  // cliente), el EQUIPO ve pestañas para saltar entre ambos. El invitado no las ve (solo alcanza el
  // canal "con el cliente"). ensureProjectChannels crea el canal con el cliente si hay un invitado.
  let audienceTabs: { id: string; audience: string | null }[] = [];
  if (channel.type === "PROJECT" && channel.projectId && session.role !== "cliente") {
    await ensureProjectChannels(channel.projectId);
    const chans = await db.chatChannel.findMany({ where: { projectId: channel.projectId, type: "PROJECT" }, select: { id: true, audience: true } });
    if (chans.length > 1) audienceTabs = chans.sort((a, b) => (a.audience === "INTERNAL" ? -1 : 1));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2.5 sm:px-6 sm:py-3">
        <div className="flex items-center gap-2">
          {/* Volver a la lista de chats (solo móvil): flecha grande tipo WhatsApp para cambiar de conversación. */}
          <Link
            href="/chat"
            aria-label="Volver a Chats"
            className="-ml-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:hidden"
          >
            <ChevronLeft className="size-6" />
          </Link>
          {isDM ? (
            <UserAvatar initials={other?.initials ?? null} color={other?.avatarColor ?? null} size="sm" />
          ) : channel.isPublic ? (
            <Hash className="size-5 shrink-0 text-muted-foreground" />
          ) : (
            <Lock className="size-5 shrink-0 text-amber-600" />
          )}
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight sm:text-lg">{title}</h1>
          {isMember ? <MuteToggle channelId={id} muted={channel.members.find((m) => m.user.id === session.id)?.muted ?? false} /> : null}
          {!isDM && !isMember ? <JoinLeave channelId={id} joined={false} /> : null}
          {!isDM && isMember && !canManage ? <JoinLeave channelId={id} joined={true} /> : null}
        </div>

        {/* Pestañas Interno / Con el cliente (solo el equipo; el invitado ve solo su chat). */}
        {audienceTabs.length > 1 ? (
          <div className="mt-2 flex gap-1">
            {audienceTabs.map((t) => {
              const active = t.id === id;
              const isClient = t.audience === "CLIENT";
              return (
                <Link
                  key={t.id}
                  href={`/chat/${t.id}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60",
                  )}
                >
                  {isClient ? <Users className="size-3.5" /> : <Lock className="size-3.5" />}
                  {isClient ? "Con el cliente" : "Interno"}
                </Link>
              );
            })}
          </div>
        ) : null}

        {canManage ? (
          <div className="mt-2">
            <ChannelSettings
              channelId={id}
              isPublic={channel.isPublic}
              canManage={canManage}
              type={channel.type}
              channelName={channel.name}
              members={channel.members.map((m) => ({ id: m.user.id, name: m.user.name, initials: m.user.initials, color: m.user.avatarColor, role: m.role }))}
              team={team.map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.avatarColor }))}
            />
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <ChannelChat
          channelId={id}
          isAdmin={isAdmin}
          me={{ id: session.id, name: session.name, initials: session.initials, color: session.color }}
          members={(() => {
            const botIds = new Set(bots.map((b) => b.id));
            // El PORTAL CLIENTE solo ve/menciona al EQUIPO de SU proyecto (no toda la empresa ni al
            // bot interno). Se acota a los miembros/responsable del proyecto de ESTE canal.
            if (session.role === "cliente") {
              const allowed = new Set<string>([channel.project?.leadId, ...(channel.project?.members.map((m) => m.userId) ?? [])].filter(Boolean) as string[]);
              return team.filter((t) => allowed.has(t.id) && !botIds.has(t.id)).map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.avatarColor }));
            }
            // Bots primero (Marcebot arriba en el @), sin repetir si también saliera en el equipo.
            return [...bots, ...team.filter((t) => !botIds.has(t.id))].map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.avatarColor }));
          })()}
          initialMessages={[...channel.messages].reverse().map((m) => ({
            id: m.id,
            body: m.body,
            parentId: m.parentId,
            deleted: !!m.deletedAt,
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
