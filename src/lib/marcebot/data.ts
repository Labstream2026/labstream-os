import { db } from "@/lib/db";
import { getTaskLabels } from "@/lib/workflow-labels";
import { bogotaDayStart } from "./time";

// Lectura de pendientes para Marcebot. Funciones puras (sin "use server"): las usan
// tanto el cron como la tarjeta del Inicio.

export type TaskLite = { id: string; title: string; due: Date | null; project: string | null; projectId: string | null };
export type EventLite = { id: string; title: string; start: Date };

export type UserPendientes = {
  overdue: TaskLite[]; // tareas abiertas vencidas
  today: TaskLite[]; // tareas que vencen hoy
  soon: TaskLite[]; // resto de la semana
  shootsToday: TaskLite[]; // rodajes de hoy
  eventsToday: EventLite[]; // citas de hoy
  imminent: EventLite[]; // citas que arrancan en los próximos 90 min
};

// Keys de estado "abierto" (no terminadas), según las etiquetas configurables del equipo.
export async function openStatusKeys(): Promise<string[]> {
  const { statuses } = await getTaskLabels();
  const open = statuses.filter((s) => !s.isDone).map((s) => s.key);
  // Salvaguarda si aún no hay etiquetas sembradas.
  return open.length ? open : ["PENDIENTE", "EN_PROCESO", "EN_ESPERA", "EN_REVISION"];
}

const WEEK_DAYS = 7;
const IMMINENT_MS = 90 * 60 * 1000;

function projectName(p: { name: string } | null | undefined): string | null {
  return p?.name ?? null;
}

export async function getUserPendientes(
  userId: string,
  openKeys: string[],
  now: Date = new Date(),
): Promise<UserPendientes> {
  const todayStart = bogotaDayStart(now);
  const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(todayStart.getTime() + WEEK_DAYS * 24 * 60 * 60 * 1000);
  const mine = { OR: [{ assigneeId: userId }, { ownerId: userId }] };

  const [tasks, shoots, events] = await Promise.all([
    db.task.findMany({
      where: { status: { in: openKeys }, dueDate: { lt: weekEnd }, ...mine },
      orderBy: { dueDate: "asc" },
      select: { id: true, title: true, dueDate: true, project: { select: { id: true, name: true } } },
    }),
    db.task.findMany({
      where: { status: { in: openKeys }, shootDate: { gte: todayStart, lt: tomorrow }, ...mine },
      orderBy: { shootDate: "asc" },
      select: { id: true, title: true, shootDate: true, project: { select: { id: true, name: true } } },
    }),
    db.calendarEvent.findMany({
      where: { start: { gte: todayStart, lt: tomorrow }, OR: [{ createdById: userId }, { attendees: { some: { userId } } }] },
      orderBy: { start: "asc" },
      select: { id: true, title: true, start: true },
    }),
  ]);

  const overdue: TaskLite[] = [];
  const today: TaskLite[] = [];
  const soon: TaskLite[] = [];
  for (const t of tasks) {
    const lite: TaskLite = { id: t.id, title: t.title, due: t.dueDate, project: projectName(t.project), projectId: t.project?.id ?? null };
    const d = t.dueDate!;
    if (d < todayStart) overdue.push(lite);
    else if (d < tomorrow) today.push(lite);
    else soon.push(lite);
  }

  const imminentCut = new Date(now.getTime() + IMMINENT_MS);
  const eventsToday: EventLite[] = events.map((e) => ({ id: e.id, title: e.title, start: e.start }));
  const imminent = eventsToday.filter((e) => e.start >= now && e.start <= imminentCut);

  return {
    overdue,
    today,
    soon,
    shootsToday: shoots.map((s) => ({ id: s.id, title: s.title, due: s.shootDate, project: projectName(s.project), projectId: s.project?.id ?? null })),
    eventsToday,
    imminent,
  };
}

// Tareas que la persona marcó como cerradas HOY (Bogotá). Para el cierre del día.
export async function getUserDoneToday(userId: string, now: Date = new Date()): Promise<TaskLite[]> {
  const todayStart = bogotaDayStart(now);
  const rows = await db.task.findMany({
    where: { completedAt: { gte: todayStart, lte: now }, OR: [{ assigneeId: userId }, { ownerId: userId }] },
    orderBy: { completedAt: "asc" },
    select: { id: true, title: true, completedAt: true, project: { select: { id: true, name: true } } },
  });
  return rows.map((t) => ({ id: t.id, title: t.title, due: t.completedAt, project: projectName(t.project), projectId: t.project?.id ?? null }));
}

export type PersonOverdue = { name: string; count: number };
export type TeamSummary = {
  overdueTotal: number;
  byPerson: PersonOverdue[]; // quién va más atrasado
  unassigned: TaskLite[]; // tareas abiertas sin responsable que vencen pronto
  deliveries: TaskLite[]; // entregables de esta semana
  shoots: TaskLite[]; // rodajes de esta semana
};

// Resumen de equipo para roles administrativos (admin, gerente, productor).
export async function getTeamSummary(openKeys: string[], now: Date = new Date()): Promise<TeamSummary> {
  const todayStart = bogotaDayStart(now);
  const weekEnd = new Date(todayStart.getTime() + WEEK_DAYS * 24 * 60 * 60 * 1000);
  const twoWeeks = new Date(todayStart.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [overdueTasks, unassigned, deliveries, shoots] = await Promise.all([
    db.task.findMany({
      where: { status: { in: openKeys }, dueDate: { lt: todayStart } },
      orderBy: { dueDate: "asc" },
      select: { id: true, title: true, dueDate: true, assignee: { select: { name: true } } },
    }),
    db.task.findMany({
      where: { status: { in: openKeys }, assigneeId: null, dueDate: { gte: todayStart, lt: twoWeeks } },
      orderBy: { dueDate: "asc" },
      select: { id: true, title: true, dueDate: true, project: { select: { id: true, name: true } } },
    }),
    db.deliverable.findMany({
      where: { dueDate: { gte: todayStart, lt: weekEnd } },
      orderBy: { dueDate: "asc" },
      select: { id: true, name: true, dueDate: true, project: { select: { id: true, name: true } } },
    }),
    db.task.findMany({
      where: { shootDate: { gte: todayStart, lt: weekEnd } },
      orderBy: { shootDate: "asc" },
      select: { id: true, title: true, shootDate: true, project: { select: { id: true, name: true } } },
    }),
  ]);

  const counts = new Map<string, number>();
  for (const t of overdueTasks) {
    const name = t.assignee?.name ?? "Sin responsable";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const byPerson = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    overdueTotal: overdueTasks.length,
    byPerson,
    unassigned: unassigned.map((t) => ({ id: t.id, title: t.title, due: t.dueDate, project: projectName(t.project), projectId: t.project?.id ?? null })),
    deliveries: deliveries.map((d) => ({ id: d.id, title: d.name, due: d.dueDate, project: projectName(d.project), projectId: d.project?.id ?? null })),
    shoots: shoots.map((s) => ({ id: s.id, title: s.title, due: s.shootDate, project: projectName(s.project), projectId: s.project?.id ?? null })),
  };
}
