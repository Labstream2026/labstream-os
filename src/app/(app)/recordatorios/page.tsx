import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { IconRecordatorios } from "@/components/icons";
import { RemindersClient, type ReminderRow, type AnchorTask, type AnchorEvent } from "./reminders-client";

export const dynamic = "force-dynamic";

// Recordatorios: avisos puntuales o recurrentes, propios o para uno/varios compañeros. Un
// recordatorio puede tener varios avisos y atarse a una tarea o cita. Superficie interna del
// equipo (el portal del cliente y el usuario demo no la ven).
export default async function RecordatoriosPage() {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo") redirect("/");

  const nowWall = new Date(Date.now() - 5 * 3_600_000); // "ahora de pared" para citas (UTC-5)
  const [reminders, team, tasks, events] = await Promise.all([
    // Los míos: los que me suenan a mí y los que yo dejé (a quien sea).
    db.reminder.findMany({
      where: { OR: [{ forUserId: session.id }, { createdById: session.id }] },
      orderBy: [{ doneAt: "asc" }, { active: "desc" }, { nextFireAt: "asc" }],
      take: 200,
      include: {
        forUser: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        task: { select: { id: true, title: true } },
        event: { select: { id: true, title: true } },
        alerts: { orderBy: { fireAt: "asc" }, select: { id: true, fireAt: true, offsetMin: true, sentAt: true, active: true } },
      },
    }),
    // Destinatarios posibles: el equipo (sin bots ni portal del cliente/demo).
    db.user.findMany({
      where: { active: true, isSystemBot: false, role: { key: { notIn: ["cliente", "demo"] } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // Tareas con fecha (mías) para "atar a": avisar N antes de la tarea.
    db.task.findMany({
      where: { dueDate: { gte: new Date(Date.now() - 86_400_000) }, OR: [{ assigneeId: session.id }, { ownerId: session.id }] },
      orderBy: { dueDate: "asc" },
      take: 40,
      select: { id: true, title: true, dueDate: true, dueTime: true },
    }),
    // Citas próximas en las que participo, para "atar a": avisar N antes de la reunión.
    db.calendarEvent.findMany({
      where: { start: { gte: nowWall }, attendees: { some: { userId: session.id } } },
      orderBy: { start: "asc" },
      take: 40,
      select: { id: true, title: true, start: true },
    }),
  ]);

  const isAdmin = session.role === "admin";
  const rows: ReminderRow[] = reminders.map((r) => ({
    id: r.id,
    title: r.title,
    notes: r.notes,
    icon: r.icon,
    color: r.color,
    priority: r.priority,
    frequency: r.frequency,
    weekdays: r.weekdays,
    dayOfMonth: r.dayOfMonth,
    timeOfDay: r.timeOfDay,
    untilYmd: r.untilYmd,
    maxFires: r.maxFires,
    nextFireAtIso: r.nextFireAt.toISOString(),
    lastFiredAtIso: r.lastFiredAt?.toISOString() ?? null,
    doneAtIso: r.doneAt?.toISOString() ?? null,
    active: r.active,
    forUser: r.forUser,
    createdBy: r.createdBy,
    task: r.task,
    event: r.event,
    alerts: r.alerts.map((a) => ({
      id: a.id,
      fireAtIso: a.fireAt.toISOString(),
      offsetMin: a.offsetMin,
      sentAtIso: a.sentAt?.toISOString() ?? null,
      active: a.active,
    })),
    canManage: r.forUserId === session.id || r.createdById === session.id || isAdmin,
  }));

  const anchorTasks: AnchorTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    dueIso: t.dueDate ? t.dueDate.toISOString() : null,
    dueTime: t.dueTime,
  }));
  const anchorEvents: AnchorEvent[] = events.map((e) => ({ id: e.id, title: e.title, startIso: e.start.toISOString() }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconRecordatorios />}
        title="Recordatorios"
        description="Avisos puntuales o recurrentes, para ti o para el equipo. Un mismo recordatorio puede sonar varias veces (hoy y mañana; 8, 9 y 10) y atarse a una tarea o cita («avísame 15 min antes»). Te llega por campana, push (móvil y escritorio) y Marcebot."
      />
      <RemindersClient
        rows={rows}
        team={team}
        anchorTasks={anchorTasks}
        anchorEvents={anchorEvents}
        meId={session.id}
        nowMs={Date.now()}
      />
    </div>
  );
}
