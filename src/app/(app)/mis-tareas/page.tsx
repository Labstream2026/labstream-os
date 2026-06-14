import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { Badge } from "@/components/ui/badge";
import { StatusSelect } from "@/components/actions/status-select";
import { setTaskStatus } from "@/app/(app)/proyectos/[id]/actions";
import { TASK_STATUS, PRIORITY, formatShortDate } from "@/lib/ui";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = Object.entries(TASK_STATUS).map(([value, m]) => ({ value, label: m.label }));
const OPEN = ["PENDIENTE", "EN_PROCESO", "EN_ESPERA", "EN_REVISION"];

export default async function MisTareasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const tasks = await db.task.findMany({
    where: { assigneeId: user.id, status: { in: OPEN as never } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: { project: { select: { id: true, name: true, emoji: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Mis tareas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {tasks.length} tarea{tasks.length === 1 ? "" : "s"} abierta{tasks.length === 1 ? "" : "s"} · asignadas a {user?.name}
      </p>

      {tasks.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No tienes tareas abiertas. 🎉</p>
      ) : (
        <div className="mt-8 space-y-2">
          {tasks.map((t) => {
            const prio = PRIORITY[t.priority];
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <Link href={`/proyectos/${t.project.id}?tab=tareas`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.project.emoji} {t.project.name}
                  </p>
                </Link>
                <Badge className={cn("text-[10px]", prio.className)}>{prio.label}</Badge>
                {t.dueDate ? (
                  <span className="hidden w-16 text-right text-xs text-muted-foreground sm:inline">
                    {formatShortDate(t.dueDate)}
                  </span>
                ) : null}
                <StatusSelect
                  value={t.status}
                  options={STATUS_OPTIONS}
                  action={setTaskStatus.bind(null, t.id, t.project.id)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
