import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { StatusSelect } from "@/components/actions/status-select";
import { ChecklistCheckbox } from "@/components/actions/checklist-checkbox";
import { TASK_STATUS, TASK_STATUS_ORDER, taskStatusMeta, PRIORITY } from "@/lib/ui";
import { cn } from "@/lib/utils";
import {
  createTask,
  setTaskStatus,
  deleteTask,
  toggleChecklistItem,
  addChecklistItem,
} from "./actions";

type ChecklistItem = { id: string; label: string; done: boolean };
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: { initials: string | null; avatarColor: string | null } | null;
  checklist: ChecklistItem[];
};
type TeamMember = { id: string; name: string; initials: string | null; avatarColor: string | null };

const STATUS_OPTIONS = Object.entries(TASK_STATUS).map(([value, m]) => ({ value, label: m.label }));

export function TasksBoard({
  projectId,
  tasks,
  team,
}: {
  projectId: string;
  tasks: Task[];
  team: TeamMember[];
}) {
  const columnFor = (status: string) =>
    (TASK_STATUS_ORDER as readonly string[]).includes(status) ? status : "PENDIENTE";

  return (
    <div className="space-y-6">
      {/* Nueva tarea */}
      <form
        action={createTask.bind(null, projectId)}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3"
      >
        <input
          name="title"
          required
          placeholder="Nueva tarea…"
          className="min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <select name="priority" defaultValue="MEDIA" className="rounded-md border border-input bg-background px-2 py-2 text-sm">
          {Object.entries(PRIORITY).map(([v, m]) => (
            <option key={v} value={v}>{m.label}</option>
          ))}
        </select>
        <select name="assigneeId" defaultValue="" className="rounded-md border border-input bg-background px-2 py-2 text-sm">
          <option value="">Sin asignar</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Añadir
        </button>
      </form>

      {/* Tablero */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUS_ORDER.map((col) => {
          const colTasks = tasks.filter((t) => columnFor(t.status) === col);
          const meta = taskStatusMeta(col);
          return (
            <div key={col} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-1">
                <span className={cn("inline-block size-2 rounded-full", meta.className.split(" ")[0])} />
                <span className="text-sm font-semibold">{meta.label}</span>
                <span className="text-xs text-muted-foreground">{colTasks.length}</span>
              </div>

              {colTasks.map((t) => {
                const prio = PRIORITY[t.priority];
                const done = t.checklist.filter((c) => c.done).length;
                return (
                  <div key={t.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{t.title}</p>
                      {t.assignee ? (
                        <UserAvatar initials={t.assignee.initials} color={t.assignee.avatarColor} size="sm" />
                      ) : null}
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <Badge className={cn("text-[10px]", prio.className)}>{prio.label}</Badge>
                      {t.checklist.length > 0 ? (
                        <span className="text-[11px] text-muted-foreground">
                          ✓ {done}/{t.checklist.length}
                        </span>
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

                    <form
                      action={addChecklistItem.bind(null, t.id, projectId)}
                      className="mt-2 flex items-center gap-1"
                    >
                      <input
                        name="label"
                        placeholder="+ ítem de checklist"
                        className="flex-1 rounded border border-input bg-background px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-ring"
                      />
                    </form>

                    <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                      <StatusSelect
                        value={t.status}
                        options={STATUS_OPTIONS}
                        action={setTaskStatus.bind(null, t.id, projectId)}
                      />
                      <form action={deleteTask.bind(null, t.id, projectId)}>
                        <button className="text-xs text-muted-foreground hover:text-destructive" title="Eliminar">
                          ✕
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
