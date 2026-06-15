import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessChannel } from "@/lib/chat-access";
import { accessibleProjectWhere } from "@/lib/project-access";
import { isEditableOffice } from "@/lib/onlyoffice";
import { AppShell } from "@/components/layout/app-shell";

// Datos por petición desde Postgres → render dinámico (evita prerender en el build de Docker).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [clients, team, notifs, general, dockTeam] = await Promise.all([
    db.client.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        // Solo los proyectos que el usuario puede ver, para el desplegable del sidebar.
        projects: {
          where: accessibleProjectWhere(session),
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, emoji: true },
        },
      },
    }),
    db.user.findMany({ take: 4, orderBy: { createdAt: "asc" }, select: { initials: true, avatarColor: true } }),
    db.notification.findMany({ where: { userId: session.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.chatChannel.findUnique({
      where: { slug: "general" },
      include: {
        members: { select: { userId: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50,
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
    }),
    db.user.findMany({
      where: { active: true, NOT: { id: session.id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, initials: true, avatarColor: true },
    }),
  ]);

  // Total de mensajes no leídos en los canales/DMs del usuario (badge del sidebar).
  // Una sola consulta con JOIN en vez de un count por canal (evita N+1).
  const unreadRows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*)::bigint AS total
    FROM "ChatMessage" m
    JOIN "ChannelMember" cm ON cm."channelId" = m."channelId"
    WHERE cm."userId" = ${session.id}
      AND m."parentId" IS NULL
      AND (m."authorId" IS NULL OR m."authorId" <> ${session.id})
      AND m."createdAt" > COALESCE(cm."lastReadAt", 'epoch'::timestamp)
  `;
  const chatUnread = Number(unreadRows[0]?.total ?? 0);

  // El canal general solo se envía al cliente si el usuario puede verlo (por si se
  // marca privado): evita filtrar mensajes a quien no tiene acceso.
  const generalVisible =
    general && canAccessChannel({ isPublic: general.isPublic, project: null, members: general.members }, session)
      ? general
      : null;

  return (
    <AppShell
      user={{
        name: session.name,
        title: session.title,
        initials: session.initials,
        color: session.color,
        avatarUrl: session.avatarUrl,
      }}
      me={{ id: session.id, name: session.name, initials: session.initials, color: session.color }}
      dockTeam={dockTeam.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }))}
      chatUnread={chatUnread}
      canAdmin={hasPermission(session, "administrar_usuarios")}
      canQuotes={hasPermission(session, "ver_cotizaciones")}
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        accentColor: c.accentColor,
        projectCount: c.projects.length,
        projects: c.projects.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
      }))}
      team={team.map((t) => ({ initials: t.initials, color: t.avatarColor }))}
      notifications={notifs.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      }))}
      generalChannel={
        generalVisible
          ? {
              id: generalVisible.id,
              name: generalVisible.name,
              messages: generalVisible.messages.map((m) => ({
                id: m.id,
                body: m.body,
                parentId: m.parentId,
                createdAt: m.createdAt.toISOString(),
                author: m.author
                  ? { name: m.author.name, initials: m.author.initials, color: m.author.avatarColor }
                  : null,
                attachments: m.attachments.map((a) => ({
                  id: a.id,
                  name: a.name,
                  mime: a.mime,
                  editable: isEditableOffice(a.name),
                })),
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
              })),
            }
          : null
      }
    >
      {children}
    </AppShell>
  );
}
