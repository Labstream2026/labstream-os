import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { setTaskStatus, setTaskDueDate } from "@/app/(app)/proyectos/[id]/actions";
import { formatShortDate } from "@/lib/ui";
import { labelOptions, labelMeta } from "@/lib/colors";
import { getTaskLabels } from "@/lib/workflow-labels";
import { cn } from "@/lib/utils";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { toDateInputValue } from "@/app/(app)/proyectos/[id]/task-shared";
import { MyTaskForm } from "./my-task-form";
import { TaskDetailButton } from "./task-detail-panel";
import { CalendarBoard } from "@/app/(app)/calendario/calendar-board";
import { eventToCalItem, taskToCalItems } from "@/app/(app)/calendario/build-items";
import { createMyEvent } from "@/app/(app)/calendario/actions";

export const dynamic = "force-dynamic";

export default async function MisTareasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { statuses, priorities } = await getTaskLabels();
  const statusOptions = labelOptions(statuses);
  // "Abiertas" = estados que no están marcados como terminados.
  const openKeys = statuses.filter((s) => !s.isDone).map((s) => s.key);
  const doneKeys = statuses.filter((s) => s.isDone).map((s) => s.key);

  const calWindowStart = new Date();
  calWindowStart.setMonth(calWindowStart.getMonth() - 1);

  const [tasks, doneTasks, team, myEvents, allMyTasks] = await Promise.all([
    db.task.findMany({
      where: {
        status: { in: openKeys },
        OR: [{ assigneeId: user.id }, { ownerId: user.id }],
      },
      orderBy: [{ dueDate: "asc" }, { status: "asc" }],
      include: {
        project: { select: { id: true, name: true, emoji: true, client: { select: { name: true } } } },
        assignedBy: { select: { name: true, initials: true, avatarColor: true } },
        checklist: { orderBy: { position: "asc" }, select: { id: true, label: true, done: true } },
      },
    }),
    // Completadas recientes: terminadas mías, las más recientes primero.
    db.task.findMany({
      where: {
        status: { in: doneKeys },
        OR: [{ assigneeId: user.id }, { ownerId: user.id }],
      },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      take: 60,
      select: {
        id: true, title: true, completedAt: true, isPrivate: true,
        project: { select: { id: true, name: true, emoji: true, client: { select: { name: true } } } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } }),
    // Mis citas (creadas por mí o donde soy asistente), para el calendario.
    db.calendarEvent.findMany({
      where: {
        start: { gte: calWindowStart },
        OR: [{ createdById: user.id }, { attendees: { some: { userId: user.id } } }],
      },
      include: {
        project: { select: { name: true, emoji: true } },
        attendees: { include: { user: { select: { name: true, initials: true, avatarColor: true } } } },
        guests: { select: { email: true } },
      },
    }),
    // Todas mis tareas con fecha (entrega o rodaje) para el calendario.
    db.task.findMany({
      where: {
        OR: [{ assigneeId: user.id }, { ownerId: user.id }],
        AND: [{ OR: [{ dueDate: { gte: calWindowStart } }, { shootDate: { gte: calWindowStart } }] }],
      },
      select: {
        id: true, title: true, dueDate: true, shootDate: true,
        project: { select: { id: true, name: true, emoji: true } },
        assignee: { select: { name: true, initials: true, avatarColor: true } },
      },
    }),
  ]);

  // Items del calendario unificado: mis citas + mis tareas (entrega/rodaje).
  const calItems = [
    ...myEvents.map((e) => eventToCalItem(e, user.id, e.projectId ? `/proyectos/${e.projectId}` : null)),
    ...allMyTasks.flatMap((t) => taskToCalItems(t)),
  ];

  const list = (
    <div className="space-y-2">
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tienes tareas abiertas. 🎉</p>
      ) : (
        tasks.map((t) => {
          const prio = labelMeta(priorities, t.priority);
          const assignedToMeByOther = t.assigneeId === user.id && t.assignedBy;
          // Solo el dueño (quien la creó) cambia prioridad/fecha; el responsable
          // que la recibió no (se la asignaron con esos datos).
          const canEditMeta = t.ownerId === user.id;
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                {t.project ? (
                  <Link href={`/proyectos/${t.project.id}?tab=tareas`} className="block min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.project.client ? `🏢 ${t.project.client.name} · ` : ""}{t.project.emoji} {t.project.name}
                    </p>
                  </Link>
                ) : (
                  <>
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.isPrivate ? "🔒 Personal" : "Personal"}
                    </p>
                  </>
                )}
                {assignedToMeByOther ? (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    Asignada por
                    <UserAvatar initials={t.assignedBy!.initials} color={t.assignedBy!.avatarColor} size="sm" />
                    {t.assignedBy!.name}
                  </p>
                ) : null}
              </div>
              <Badge className={cn("text-[10px]", prio.chip)}>{prio.label}</Badge>
              {canEditMeta ? (
                <DateInput
                  name="dueDate"
                  value={toDateInputValue(t.dueDate)}
                  action={setTaskDueDate.bind(null, t.id, t.project?.id ?? "")}
                  title="Fecha de entrega"
                />
              ) : (
                <span className="text-xs text-muted-foreground" title="La fecha la fija quien asignó la tarea">
                  📅 {formatShortDate(t.dueDate) ?? "Sin fecha"}
                </span>
              )}
              <StatusSelect value={t.status} options={statusOptions} action={setTaskStatus.bind(null, t.id, t.project?.id ?? "")} />
              <TaskDetailButton
                task={{
                  id: t.id,
                  title: t.title,
                  description: t.description,
                  status: t.status,
                  priority: t.priority,
                  dueDateValue: toDateInputValue(t.dueDate) ?? "",
                  projectId: t.project?.id ?? null,
                  projectName: t.project?.name ?? null,
                  projectEmoji: t.project?.emoji ?? null,
                  assigneeId: t.assigneeId,
                  checklist: t.checklist,
                }}
                team={team}
                statuses={statuses}
                priorities={priorities}
                canEditMeta={canEditMeta}
              />
            </div>
          );
        })
      )}
    </div>
  );

  const completed = (
    <div className="space-y-2">
      {doneTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no has completado tareas.</p>
      ) : (
        doneTasks.map((t) => {
          const when = t.completedAt
            ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(t.completedAt)
            : null;
          const inner = (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-[11px] text-white">✓</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-muted-foreground line-through">{t.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.project
                    ? `${t.project.client ? `🏢 ${t.project.client.name} · ` : ""}${t.project.emoji} ${t.project.name}`
                    : t.isPrivate ? "🔒 Personal" : "Personal"}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground" title="Fecha y hora de finalización">
                {when ? `Completada ${when}` : "Completada"}
              </span>
            </div>
          );
          return t.project ? (
            <Link key={t.id} href={`/proyectos/${t.project.id}?tab=tareas`} className="block">{inner}</Link>
          ) : (
            <div key={t.id}>{inner}</div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Mis tareas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {tasks.length} tarea{tasks.length === 1 ? "" : "s"} abierta{tasks.length === 1 ? "" : "s"} · {user.name}
      </p>

      <div className="mt-6">
        <MyTaskForm team={team} priorities={priorities} />
      </div>

      <div className="mt-6">
        <ViewTabs
          storageKey="mis-tareas-view"
          views={[
            { key: "lista", label: "Lista", icon: "☰", node: list },
            {
              key: "calendario", label: "Calendario", icon: "📅",
              node: (
                <div className="h-[72vh]">
                  <CalendarBoard
                    items={calItems}
                    onCreate={createMyEvent}
                    team={team.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }))}
                  />
                </div>
              ),
            },
            { key: "completadas", label: "Completadas", icon: "✓", node: completed },
          ]}
        />
      </div>
    </div>
  );
}
