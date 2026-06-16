import type { CalItem } from "./my-calendar";

// Constructores compartidos: convierten filas de CalendarEvent / Task en CalItem,
// para que TODOS los calendarios de la app (equipo, proyecto, cliente, mis tareas)
// muestren y editen los eventos de la misma forma.

const fmtTime = (d: Date) => new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(d);

export type EventRow = {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  description: string | null;
  location: string | null;
  createdById: string | null;
  projectId: string | null;
  source?: string;
  project?: { name: string | null; emoji: string | null } | null;
  attendees: { userId: string; user: { name: string; initials: string | null; avatarColor: string | null } }[];
  guests: { email: string }[];
};

// Convierte un evento. `canEdit` = lo creó el usuario actual y es un evento de la app.
export function eventToCalItem(e: EventRow, currentUserId: string | undefined, link?: string | null): CalItem {
  return {
    id: `e-${e.id}`,
    eventId: e.id,
    canEdit: e.createdById === currentUserId && (e.source ?? "app") === "app",
    attendeeIds: e.attendees.map((a) => a.userId),
    title: e.title,
    date: e.start.toISOString(),
    start: e.start.toISOString(),
    end: e.end ? e.end.toISOString() : null,
    kind: "event",
    allDay: e.allDay,
    time: e.allDay ? null : fmtTime(e.start),
    endTime: !e.allDay && e.end ? fmtTime(e.end) : null,
    projectName: e.project?.name ?? null,
    projectEmoji: e.project?.emoji ?? null,
    description: e.description,
    location: e.location,
    guests: e.guests.map((g) => g.email),
    attendees: e.attendees.map((a) => ({ name: a.user.name, initials: a.user.initials, color: a.user.avatarColor })),
    link: link !== undefined ? link : e.projectId ? `/proyectos/${e.projectId}` : null,
  };
}

export type TaskRow = {
  id: string;
  title: string;
  dueDate: Date | null;
  shootDate: Date | null;
  project?: { id: string; name: string | null; emoji: string | null } | null;
  assignee?: { name: string; initials: string | null; avatarColor: string | null } | null;
};

// Convierte una tarea en hasta dos chips: entrega (dueDate) y rodaje (shootDate).
export function taskToCalItems(t: TaskRow): CalItem[] {
  const out: CalItem[] = [];
  const assignee = t.assignee ? { name: t.assignee.name, initials: t.assignee.initials, color: t.assignee.avatarColor } : null;
  const link = t.project ? `/proyectos/${t.project.id}?tab=tareas` : "/mis-tareas";
  const base = { projectName: t.project?.name ?? null, projectEmoji: t.project?.emoji ?? null, assignee, link, allDay: true as const };
  if (t.dueDate) out.push({ id: `t-${t.id}`, title: t.title, date: t.dueDate.toISOString(), start: t.dueDate.toISOString(), kind: "task", ...base });
  if (t.shootDate) out.push({ id: `s-${t.id}`, title: t.title, date: t.shootDate.toISOString(), start: t.shootDate.toISOString(), kind: "shoot", ...base });
  return out;
}
