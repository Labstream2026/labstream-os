import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { PRIORITY } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { createTask, setTaskStatus, setTaskStage, setTaskShootDate, deleteTask } from "./actions";
import { type Task, type TeamMember, STATUS_OPTIONS, toDateInputValue } from "./task-shared";

// Vista Lista: todas las tareas en una tabla densa estilo Notion, ordenadas por fase.
export function TasksList({
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
  const orderOf = (t: Task) => {
    const i = t.stage ? cols.indexOf(t.stage) : -1;
    return i < 0 ? cols.length : i;
  };
  const sorted = [...tasks].sort((a, b) => orderOf(a) - orderOf(b));

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Tarea</th>
            <th className="px-3 py-2 font-medium">Fase</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Prioridad</th>
            <th className="px-3 py-2 font-medium">Responsable</th>
            <th className="px-3 py-2 font-medium">🎬 Rodaje</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-xs text-muted-foreground">
                Aún no hay tareas. Añade la primera abajo.
              </td>
            </tr>
          ) : null}
          {sorted.map((t) => {
            const prio = PRIORITY[t.priority] ?? PRIORITY.MEDIA;
            const done = t.checklist.filter((c) => c.done).length;
            return (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-3 py-2">
                  <span className="font-medium">{t.title}</span>
                  {t.checklist.length > 0 ? (
                    <span className="ml-2 text-[11px] text-muted-foreground">✓ {done}/{t.checklist.length}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <StatusSelect
                    value={t.stage && cols.includes(t.stage) ? t.stage : cols[0]}
                    options={stageOptions}
                    action={setTaskStage.bind(null, t.id, projectId)}
                  />
                </td>
                <td className="px-3 py-2">
                  <StatusSelect
                    value={t.status}
                    options={STATUS_OPTIONS}
                    action={setTaskStatus.bind(null, t.id, projectId)}
                  />
                </td>
                <td className="px-3 py-2">
                  <Badge className={cn("text-[10px]", prio.className)}>{prio.label}</Badge>
                </td>
                <td className="px-3 py-2">
                  {t.assignee ? (
                    <UserAvatar initials={t.assignee.initials} color={t.assignee.avatarColor} size="sm" />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <DateInput
                    name="shootDate"
                    value={toDateInputValue(t.shootDate)}
                    action={setTaskShootDate.bind(null, t.id, projectId)}
                    title="Fecha de rodaje"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <form action={deleteTask.bind(null, t.id, projectId)}>
                    <button className="px-1 text-xs text-muted-foreground hover:text-destructive" title="Eliminar">
                      ✕
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Añadir tarea (cae en la primera fase) */}
      <form
        action={createTask.bind(null, projectId)}
        className="flex flex-wrap items-center gap-2 border-t border-border bg-card/50 px-3 py-2"
      >
        <input type="hidden" name="stage" value={cols[0]} />
        <input
          name="title"
          required
          placeholder="+ Añadir tarea"
          className="min-w-48 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <select name="priority" defaultValue="MEDIA" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs">
          {Object.entries(PRIORITY).map(([v, m]) => (
            <option key={v} value={v}>{m.label}</option>
          ))}
        </select>
        <select name="assigneeId" defaultValue="" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs">
          <option value="">Sin asignar</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          Añadir
        </button>
      </form>
    </div>
  );
}
