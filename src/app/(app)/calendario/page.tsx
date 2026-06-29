import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { CalendarBoard } from "./calendar-board";
import { type CalItem } from "./my-calendar";
import { createMyEvent } from "./actions";
import { buildSessionTimeline } from "@/lib/timeline-data";
import { GlobalTimeline } from "@/app/(app)/timeline/global-timeline";
import { taskUrgency, urgencyHex } from "@/lib/task-urgency";

export const dynamic = "force-dynamic";

const fmtTime = (d: Date) => new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(d);

export default async function CalendarioPage() {
  const session = await getSession();
  // Acceso al calendario por permiso (el backfill lo da al equipo; los clientes no).
  if (!hasPermission(session, "ver_calendario")) redirect("/");
  // El cronograma (vista interna) es cross-proyecto: solo si puede ver proyectos.
  const canTimeline = hasPermission(session, "ver_proyectos");
  // Ventana acotada: desde el inicio del mes anterior en adelante.
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const meId = session?.id ?? "";
  // El portal del cliente solo ve en el calendario lo de SUS proyectos (nunca los eventos del
  // equipo sin proyecto, que son visibles para todo el equipo).
  const isCliente = session?.role === "cliente";

  const accessSelect = { isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } as const;

  const [allEvents, allTasks, team] = await Promise.all([
    db.calendarEvent.findMany({
      // Privacidad en la propia consulta: las citas importadas de un calendario PERSONAL
      // (source != "app", p. ej. Synology/CalDAV) solo se cargan si son del usuario o lo
      // tienen como invitado; así los eventos personales de otros ni siquiera llegan al
      // servidor. Las citas de la app se cargan todas y se filtran por acceso más abajo.
      where: {
        start: { gte: windowStart },
        OR: [
          { source: "app" },
          { createdById: meId },
          { attendees: { some: { userId: meId } } },
        ],
      },
      orderBy: { start: "asc" },
      include: {
        project: { select: { name: true, emoji: true, ...accessSelect } },
        attendees: { include: { user: { select: { name: true, initials: true, avatarColor: true } } } },
        guests: { select: { email: true } },
      },
    }),
    // TODAS las tareas del equipo con fecha de entrega o de rodaje (no solo las mías).
    db.task.findMany({
      where: {
        OR: [{ dueDate: { gte: windowStart } }, { shootDate: { gte: windowStart } }],
      },
      select: {
        id: true, title: true, dueDate: true, shootDate: true, isPrivate: true, ownerId: true, assigneeId: true,
        assignee: { select: { name: true, initials: true, avatarColor: true } },
        project: { select: { id: true, name: true, emoji: true, ...accessSelect } },
      },
    }),
    db.user.findMany({ where: { active: true, id: { not: session?.id } }, orderBy: { name: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } }),
  ]);

  const timeline = canTimeline ? await buildSessionTimeline(session) : null;

  // Privacidad de citas:
  // - Las importadas de un calendario PERSONAL (source != "app") son privadas de su dueño e
  //   invitados, NUNCA del equipo aunque no tengan proyecto (corrige fuga de citas personales).
  // - Las creadas en la app: sin proyecto = del equipo; con proyecto = solo quien tiene acceso
  //   o es invitado/creador.
  const events = allEvents.filter((e) => {
    if (e.source !== "app") {
      return e.createdById === meId || e.attendees.some((a) => a.userId === meId);
    }
    // Cliente: solo eventos de la app que pertenezcan a un proyecto suyo.
    if (isCliente) return !!e.project && canAccessProject(e.project, session);
    if (!e.project) return true;
    if (e.createdById === meId) return true;
    if (e.attendees.some((a) => a.userId === meId)) return true;
    return canAccessProject(e.project, session);
  });

  // Privacidad de tareas: ocultar las privadas (salvo dueño/responsable) y las de
  // proyectos privados sin acceso (salvo dueño/responsable).
  const mine = (t: { ownerId: string | null; assigneeId: string | null }) => t.ownerId === session?.id || t.assigneeId === session?.id;
  const tasks = allTasks.filter((t) => {
    if (t.isPrivate && !mine(t)) return false;
    if (t.project && !mine(t) && !canAccessProject(t.project, session)) return false;
    return true;
  });

  const items: CalItem[] = [
    ...events.map((e) => ({
      id: `e-${e.id}`,
      eventId: e.id,
      canEdit: e.createdById === session?.id && e.source === "app",
      attendeeIds: e.attendees.map((a) => a.userId),
      title: e.title,
      date: e.start.toISOString(),
      start: e.start.toISOString(),
      end: e.end ? e.end.toISOString() : null,
      kind: "event" as const,
      allDay: e.allDay,
      time: e.allDay ? null : fmtTime(e.start),
      endTime: !e.allDay && e.end ? fmtTime(e.end) : null,
      projectName: e.project?.name ?? null,
      projectEmoji: e.project?.emoji ?? null,
      description: e.description,
      location: e.location,
      guests: e.guests.map((g) => g.email),
      attendees: e.attendees.map((a) => ({ name: a.user.name, initials: a.user.initials, color: a.user.avatarColor })),
      link: e.projectId ? `/proyectos/${e.projectId}` : null,
    })),
    // Tareas con fecha de entrega.
    ...tasks.filter((t) => t.dueDate).map((t) => ({
      id: `t-${t.id}`,
      title: t.title,
      date: t.dueDate!.toISOString(),
      start: t.dueDate!.toISOString(),
      kind: "task" as const,
      urgencyHex: urgencyHex(taskUrgency({ dueDate: t.dueDate }).state),
      allDay: true,
      projectName: t.project?.name ?? null,
      projectEmoji: t.project?.emoji ?? null,
      assignee: t.assignee ? { name: t.assignee.name, initials: t.assignee.initials, color: t.assignee.avatarColor } : null,
      link: t.project ? `/proyectos/${t.project.id}?tab=tareas` : "/mis-tareas",
    })),
    // Tareas con fecha de rodaje (día de grabación).
    ...tasks.filter((t) => t.shootDate).map((t) => ({
      id: `s-${t.id}`,
      title: t.title,
      date: t.shootDate!.toISOString(),
      start: t.shootDate!.toISOString(),
      kind: "shoot" as const,
      allDay: true,
      projectName: t.project?.name ?? null,
      projectEmoji: t.project?.emoji ?? null,
      assignee: t.assignee ? { name: t.assignee.name, initials: t.assignee.initials, color: t.assignee.avatarColor } : null,
      link: t.project ? `/proyectos/${t.project.id}?tab=tareas` : "/mis-tareas",
    })),
  ];

  const timelineNode = timeline ? (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Línea de tiempo de todos los proyectos del estudio, con rodajes y entregas. Arrastra la barra de un proyecto para reprogramarlo o haz clic para abrirlo.
        {timeline.undatedCount > 0 ? ` · ${timeline.undatedCount} proyecto${timeline.undatedCount === 1 ? "" : "s"} sin fechas.` : ""}
      </p>
      <GlobalTimeline clients={timeline.clients} milestones={timeline.milestones} />
    </div>
  ) : null;

  return (
    <div className="flex h-full flex-col px-4 py-6 sm:px-6">
      <h1 className="shrink-0 text-3xl font-bold tracking-tight">Calendario del equipo</h1>
      <div className="mt-4 min-h-0 flex-1">
        <CalendarBoard
          items={items}
          onCreate={createMyEvent}
          detailMode="dock"
          team={team.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }))}
          timelineNode={timelineNode}
        />
      </div>
    </div>
  );
}
