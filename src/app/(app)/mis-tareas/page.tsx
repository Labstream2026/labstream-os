import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { UserAvatar } from "@/components/user-avatar";
import { PriorityPill } from "@/components/priority-pill";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { setTaskStatus, setTaskDueDate } from "@/app/(app)/proyectos/[id]/actions";
import { formatShortDate } from "@/lib/ui";
import { taskUrgency, urgencyLabel, URGENCY_META } from "@/lib/task-urgency";
import { userComplianceSummary } from "@/lib/compliance";
import { labelOptions } from "@/lib/colors";
import { getTaskLabels } from "@/lib/workflow-labels";
import { cn } from "@/lib/utils";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { toDateInputValue } from "@/app/(app)/proyectos/[id]/task-shared";
import { TaskDetailButton } from "./task-detail-panel";

export const dynamic = "force-dynamic";

function SummaryTile({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <p className="text-2xl font-bold tabular-nums" style={{ color: count > 0 ? color : undefined }}>{count}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function MisTareasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { statuses, priorities } = await getTaskLabels();
  const statusOptions = labelOptions(statuses);
  // "Abiertas" = estados que no están marcados como terminados.
  const openKeys = statuses.filter((s) => !s.isDone).map((s) => s.key);
  const doneKeys = statuses.filter((s) => s.isDone).map((s) => s.key);

  const [tasks, doneTasks, team] = await Promise.all([
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
        id: true, title: true, completedAt: true, dueDate: true, isPrivate: true,
        project: { select: { id: true, name: true, emoji: true, client: { select: { name: true } } } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } }),
  ]);

  // Cumplimiento personal (cada quien ve el suyo, sin permiso especial).
  const sla = await userComplianceSummary(user.id);

  // Agrupar las tareas abiertas por urgencia de su fecha de entrega.
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(startToday);
  endToday.setDate(endToday.getDate() + 1);
  const weekEnd = new Date(startToday);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const bucketOf = (due: Date | null): string => {
    if (!due) return "sin";
    const d = new Date(due);
    if (d < startToday) return "vencidas";
    if (d < endToday) return "hoy";
    if (d < weekEnd) return "semana";
    return "despues";
  };
  const GROUPS = [
    { key: "vencidas", label: "Vencidas", cls: "text-destructive" },
    { key: "hoy", label: "Hoy", cls: "text-foreground" },
    { key: "semana", label: "Esta semana", cls: "text-muted-foreground" },
    { key: "despues", label: "Más adelante", cls: "text-muted-foreground" },
    { key: "sin", label: "Sin fecha", cls: "text-muted-foreground" },
  ];

  // Resumen rápido por urgencia (tiles arriba): de un vistazo, qué aprieta.
  const counts: Record<string, number> = { vencidas: 0, hoy: 0, semana: 0, despues: 0, sin: 0 };
  for (const t of tasks) counts[bucketOf(t.dueDate)] = (counts[bucketOf(t.dueDate)] ?? 0) + 1;

  const taskRow = (t: (typeof tasks)[number]) => {
          const u = taskUrgency({ dueDate: t.dueDate, completedAt: null, isDone: false });
          const assignedToMeByOther = t.assigneeId === user.id && t.assignedBy;
          // Solo el dueño (quien la creó) cambia prioridad/fecha; el responsable
          // que la recibió no (se la asignaron con esos datos).
          const canEditMeta = t.ownerId === user.id;
          return (
            <div key={t.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3", URGENCY_META[u.state].row)}>
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
              <PriorityPill priorities={priorities} value={t.priority} />
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
              {u.state === "sin" ? null : (
                <span className={cn("text-xs font-medium", URGENCY_META[u.state].text)}>
                  {urgencyLabel(u.state, u.days)}
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
  };

  const list = (
    <div className="space-y-5">
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tienes tareas abiertas. 🎉</p>
      ) : (
        GROUPS.map((g) => {
          const items = tasks.filter((t) => bucketOf(t.dueDate) === g.key);
          if (!items.length) return null;
          return (
            <div key={g.key}>
              <h3 className={cn("mb-2 text-xs font-semibold uppercase tracking-wide", g.cls)}>
                {g.label} <span className="text-muted-foreground">· {items.length}</span>
              </h3>
              <div className="space-y-2">{items.map(taskRow)}</div>
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
          const u = taskUrgency({ dueDate: t.dueDate, completedAt: t.completedAt, isDone: true });
          const late = u.state === "hecha_tarde";
          const inner = (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-[11px] text-white", late ? "bg-amber-500" : "bg-emerald-500")}>✓</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-muted-foreground line-through">{t.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.project
                    ? `${t.project.client ? `🏢 ${t.project.client.name} · ` : ""}${t.project.emoji} ${t.project.name}`
                    : t.isPrivate ? "🔒 Personal" : "Personal"}
                </p>
              </div>
              {t.dueDate ? (
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", URGENCY_META[u.state].className)}>
                  {late ? "Tarde" : "A tiempo"}
                </span>
              ) : null}
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <ViewTabs
        storageKey="mis-tareas-view"
        titleSlot={
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">Mis tareas</h1>
              {sla && sla.pct !== null ? (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    sla.pct >= 85
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : sla.pct >= 60
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
                  )}
                  title={`${sla.onTime} a tiempo · ${sla.late} tarde · ${sla.overdueOpen} vencidas`}
                >
                  Cumples {sla.pct}% a tiempo
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {tasks.length} tarea{tasks.length === 1 ? "" : "s"} abierta{tasks.length === 1 ? "" : "s"} · {user.name}
            </p>
            <div className="mt-4 grid max-w-2xl grid-cols-2 gap-2.5 sm:grid-cols-4">
              <SummaryTile count={counts.vencidas} label="Vencidas" color="#e24b4a" />
              <SummaryTile count={counts.hoy} label="Hoy" color="#ba7517" />
              <SummaryTile count={counts.semana} label="Esta semana" color="#2a78d6" />
              <SummaryTile count={counts.despues + counts.sin} label="Más adelante" color="#888780" />
            </div>
          </div>
        }
        views={[
          { key: "lista", label: "Lista", icon: "☰", node: list },
          { key: "completadas", label: "Completadas", icon: "✓", node: completed },
        ]}
      />
    </div>
  );
}
