import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { ChecklistCheckbox } from "@/components/actions/checklist-checkbox";
import { PRIORITY } from "@/lib/ui";
import { cn } from "@/lib/utils";
import {
  createTask,
  setTaskStatus,
  setTaskStage,
  setTaskShootDate,
  deleteTask,
  toggleChecklistItem,
  addChecklistItem,
} from "./actions";
import { type Task, type TeamMember, STATUS_OPTIONS, toDateInputValue } from "./task-shared";

export function TasksBoard({
  projectId,
  tasks,
  team,
  stages,
}: {
  projectId: string;
  tasks: Task[];
  team: TeamMember[];
  stages: string[];
}) {
  const cols = stages.length ? stages : ["Por hacer"];
  const stageOptions = cols.map((s) => ({ value: s, label: s }));
  const colFor = (t: Task) => (t.stage && cols.includes(t.stage) ? t.stage : cols[0]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {cols.map((col) => {
        const colTasks = tasks.filter((t) => colFor(t) === col);
        return (
          <div key={col} className="flex w-72 shrink-0 flex-col gap-2.5">
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm font-semibold">{col}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {colTasks.length}
              </span>
            </div>

            {colTasks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Sin tareas en esta fase
              </p>
            ) : null}

            {colTasks.map((t) => {
              const prio = PRIORITY[t.priority] ?? PRIORITY.MEDIA;
              const done = t.checklist.filter((c) => c.done).length;
              return (
                <div key={t.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{t.title}</p>
                    {t.assignee ? (
                      <UserAvatar initials={t.assignee.initials} color={t.assignee.avatarColor} size="sm" />
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge className={cn("text-[10px]", prio.className)}>{prio.label}</Badge>
                    {t.checklist.length > 0 ? (
                      <span className="text-[11px] text-muted-foreground">✓ {done}/{t.checklist.length}</span>
                    ) : null}
                  </div>

                  {t.checklist.length > 0 ? (
                    <div className="mt-2 space-y-1 border-t border-border pt-2">
                      {t.checklist.map((c) => (
                        <ChecklistCheckbox
                          key={c.id}
                          checked={c.done}
                          label={c.label}
                          action={toggleChecklistItem.bind(null, c.id, projectId)}
                        />
                      ))}
                    </div>
                  ) : null}

                  <form action={addChecklistItem.bind(null, t.id, projectId)} className="mt-2">
                    <input
                      name="label"
                      placeholder="+ ítem de checklist"
                      className="w-full rounded border border-input bg-background px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-ring"
                    />
                  </form>

                  <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                    <StatusSelect
                      value={colFor(t)}
                      options={stageOptions}
                      action={setTaskStage.bind(null, t.id, projectId)}
                      className="flex-1"
                    />
                    <StatusSelect
                      value={t.status}
                      options={STATUS_OPTIONS}
                      action={setTaskStatus.bind(null, t.id, projectId)}
                    />
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">🎬 Rodaje</span>
                    <DateInput
                      name="shootDate"
                      value={toDateInputValue(t.shootDate)}
                      action={setTaskShootDate.bind(null, t.id, projectId)}
                      title="Fecha de rodaje"
                      className="flex-1"
                    />
                    <form action={deleteTask.bind(null, t.id, projectId)}>
                      <button className="px-1 text-xs text-muted-foreground hover:text-destructive" title="Eliminar">
                        ✕
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}

            {/* Añadir tarea en esta fase */}
            <form action={createTask.bind(null, projectId)} className="rounded-lg border border-dashed border-border bg-card/50 p-2">
              <input type="hidden" name="stage" value={col} />
              <input
                name="title"
                required
                placeholder="+ Añadir tarea"
                className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:bg-background"
              />
              <div className="mt-1 flex items-center gap-1.5">
                <select name="priority" defaultValue="MEDIA" className="rounded-md border border-input bg-background px-1.5 py-1 text-[11px]">
                  {Object.entries(PRIORITY).map(([v, m]) => (
                    <option key={v} value={v}>{m.label}</option>
                  ))}
                </select>
                <select name="assigneeId" defaultValue="" className="min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 py-1 text-[11px]">
                  <option value="">Sin asignar</option>
                  {team.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <button className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90">
                  Añadir
                </button>
              </div>
            </form>
          </div>
        );
      })}
    </div>
  );
}
