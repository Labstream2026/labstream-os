import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { setTaskStatus, setTaskDueDate } from "@/app/(app)/proyectos/[id]/actions";
import { TASK_STATUS, PRIORITY, formatShortDate } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { toDateInputValue } from "@/app/(app)/proyectos/[id]/task-shared";
import { MyTaskForm } from "./my-task-form";
import { DueCalendar } from "./due-calendar";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = Object.entries(TASK_STATUS).map(([value, m]) => ({ value, label: m.label }));
const OPEN = ["PENDIENTE", "EN_PROCESO", "EN_ESPERA", "EN_REVISION"];

export default async function MisTareasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [tasks, team] = await Promise.all([
    db.task.findMany({
      where: {
        status: { in: OPEN as never },
        OR: [{ assigneeId: user.id }, { ownerId: user.id }],
      },
      orderBy: [{ dueDate: "asc" }, { status: "asc" }],
      include: {
        project: { select: { id: true, name: true, emoji: true } },
        assignedBy: { select: { name: true, initials: true, avatarColor: true } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const calItems = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    priority: t.priority,
    projectName: t.project?.name ?? null,
  }));

  const list = (
    <div className="space-y-2">
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tienes tareas abiertas. 🎉</p>
      ) : (
        tasks.map((t) => {
          const prio = PRIORITY[t.priority] ?? PRIORITY.MEDIA;
          const assignedToMeByOther = t.assigneeId === user.id && t.assignedBy;
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                {t.project ? (
                  <Link href={`/proyectos/${t.project.id}?tab=tareas`} className="block min-w-0">
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.project.emoji} {t.project.name}</p>
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
              <Badge className={cn("text-[10px]", prio.className)}>{prio.label}</Badge>
              <DateInput
                name="dueDate"
                value={toDateInputValue(t.dueDate)}
                action={setTaskDueDate.bind(null, t.id, t.project?.id ?? "")}
                title="Fecha de entrega"
              />
              <StatusSelect value={t.status} options={STATUS_OPTIONS} action={setTaskStatus.bind(null, t.id, t.project?.id ?? "")} />
            </div>
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
        <MyTaskForm team={team} />
      </div>

      <div className="mt-6">
        <ViewTabs
          storageKey="mis-tareas-view"
          views={[
            { key: "lista", label: "Lista", icon: "☰", node: list },
            { key: "calendario", label: "Calendario", icon: "📅", node: <DueCalendar items={calItems} /> },
          ]}
        />
      </div>
    </div>
  );
}
