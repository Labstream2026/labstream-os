import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessChannel } from "@/lib/chat-access";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { canSeeWiki } from "@/lib/wiki-access";
import { isEditableOffice } from "@/lib/onlyoffice";
import { getTaskLabels } from "@/lib/workflow-labels";
import { labelOptions } from "@/lib/colors";
import { AppShell } from "@/components/layout/app-shell";
import { getUserPreference } from "@/lib/user-preference";
import { MarcebotPopup } from "./marcebot-popup";

// Datos por petición desde Postgres → render dinámico (evita prerender en el build de Docker).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [clients, team, notifs, general, dockTeam] = await Promise.all([
    db.client.findMany({
      // Solo los clientes que el usuario puede ver (miembro o participa en sus proyectos),
      // y solo los ACTIVOS: los desactivados no estorban en el menú.
      where: { AND: [accessibleClientWhere(session), { isActive: true }] },
      // Orden alfabético por nombre. El orden definitivo se afina abajo con localeCompare
      // (insensible a mayúsculas/acentos) porque la colación de Postgres no garantiza
      // ordenar "ANDREA" y "Diana" como en un diccionario.
      orderBy: { name: "asc" },
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
    db.notification.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { actor: { select: { name: true, initials: true, avatarColor: true, avatarUrl: true } } },
    }),
    db.chatChannel.findUnique({
      // El chat por defecto del dock es el "Chat del día" del equipo (estados-equipo).
      where: { slug: "estados-equipo" },
      include: {
        members: { select: { userId: true } },
        messages: {
          // El admin ve los borrados (en gris) para seguimiento; los demás no.
          where: session.role === "admin" ? undefined : { deletedAt: null },
          // Los 50 MÁS RECIENTES (desc) + reverse abajo. asc+take:50 traía los 50 más viejos.
          orderBy: { createdAt: "desc" },
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
      AND m."deletedAt" IS NULL
      AND (m."authorId" IS NULL OR m."authorId" <> ${session.id})
      AND m."createdAt" > COALESCE(cm."lastReadAt", 'epoch'::timestamp)
  `;
  const chatUnread = Number(unreadRows[0]?.total ?? 0);

  // Entregables pendientes de MI pre-aprobación (badge de «Proyectos a revisar»).
  // Solo los que ME corresponden como RESPONSABLE: soy el reviewer asignado; o si el
  // entregable no tiene reviewer, soy el lead del proyecto (y en último caso su dueño).
  // Antes el admin veía TODOS → se quitó: la pre-aprobación es del responsable.
  const reviewPending = await db.deliverable.count({
    where: {
      status: "REVISION_INTERNA",
      OR: [
        // Soy co-revisor asignado.
        { reviewers: { some: { userId: session.id } } },
        // Sin revisores asignados → cae al lead y, en último caso, al dueño del entregable.
        { reviewers: { none: {} }, project: { leadId: session.id } },
        { reviewers: { none: {} }, project: { leadId: null }, ownerId: session.id },
      ],
    },
  });
  const showWiki = await canSeeWiki(session);

  // Preferencias del usuario (panel lateral/chat, accesibilidad) que sincronizan entre dispositivos.
  const prefs = await getUserPreference(session.id);

  // Prioridades para el botón flotante de creación rápida (tareas/proyectos).
  const { priorities } = await getTaskLabels();
  const fabPriorities = labelOptions(priorities);

  // Páginas de la Wiki para el buscador global ⌘K (solo si el usuario ve la Wiki).
  const wikiPages = showWiki
    ? await db.wikiPage.findMany({
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: { id: true, title: true, section: true },
      })
    : [];

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
      isAdmin={session.role === "admin"}
      isCliente={session.role === "cliente"}
      dockTeam={dockTeam.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }))}
      chatUnread={chatUnread}
      reviewPending={reviewPending}
      initialSidebarCollapsed={prefs.sidebarCollapsed}
      initialChatPanelOpen={prefs.chatPanelOpen}
      reduceMotion={prefs.reduceMotion}
      canAdmin={hasPermission(session, "administrar_usuarios")}
      canQuotes={hasPermission(session, "ver_finanzas")}
      canAsistente={hasPermission(session, "ver_asistente")}
      canWiki={showWiki}
      canBiblioteca={hasPermission(session, "ver_biblioteca")}
      canCalendar={hasPermission(session, "ver_calendario")}
      canTimeline={hasPermission(session, "ver_proyectos")}
      wikiPages={wikiPages}
      canReports={hasPermission(session, "ver_reportes")}
      canClients={hasPermission(session, "ver_clientes")}
      canPapelera={hasPermission(session, "ver_papelera")}
      canCreateTasks={hasPermission(session, "crear_tareas")}
      canCreateProjects={hasPermission(session, "crear_proyectos")}
      fabPriorities={fabPriorities}
      clients={clients
        .map((c) => ({
          id: c.id,
          name: c.name,
          emoji: c.emoji,
          accentColor: c.accentColor,
          projectCount: c.projects.length,
          projects: c.projects.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji })),
        }))
        // Orden alfabético real: insensible a mayúsculas/acentos y con reglas del español.
        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }))}
      team={team.map((t) => ({ initials: t.initials, color: t.avatarColor }))}
      notifications={notifs.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
        actor: n.actor
          ? { name: n.actor.name, initials: n.actor.initials, color: n.actor.avatarColor, url: n.actor.avatarUrl }
          : null,
      }))}
      generalChannel={
        generalVisible
          ? {
              id: generalVisible.id,
              name: generalVisible.name,
              messages: [...generalVisible.messages].reverse().map((m) => ({
                id: m.id,
                body: m.body,
                parentId: m.parentId,
                deleted: !!m.deletedAt,
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
      <MarcebotPopup />
    </AppShell>
  );
}
