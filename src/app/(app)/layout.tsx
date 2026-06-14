import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { isEditableOffice } from "@/lib/onlyoffice";
import { AppShell } from "@/components/layout/app-shell";

// Datos por petición desde Postgres → render dinámico (evita prerender en el build de Docker).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [clients, team, notifs, general] = await Promise.all([
    db.client.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { projects: true } } },
    }),
    db.user.findMany({ take: 4, orderBy: { createdAt: "asc" }, select: { initials: true, avatarColor: true } }),
    db.notification.findMany({ where: { userId: session.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.chatChannel.findUnique({
      where: { slug: "general" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50,
          include: {
            author: { select: { name: true, initials: true, avatarColor: true } },
            attachments: true,
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
  ]);

  return (
    <AppShell
      user={{
        name: session.name,
        title: session.title,
        initials: session.initials,
        color: session.color,
        avatarUrl: session.avatarUrl,
      }}
      me={{ name: session.name, initials: session.initials, color: session.color }}
      canAdmin={hasPermission(session, "administrar_usuarios")}
      canQuotes={hasPermission(session, "ver_cotizaciones")}
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        accentColor: c.accentColor,
        projectCount: c._count.projects,
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
        general
          ? {
              id: general.id,
              name: general.name,
              messages: general.messages.map((m) => ({
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
