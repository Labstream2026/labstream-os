import { UserAvatar } from "@/components/user-avatar";
import { PriorityPill } from "@/components/priority-pill";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/ui";
import { todayInputValue } from "@/lib/today";
import { SubmitButton } from "@/components/submit-button";
import { taskUrgency, urgencyLabel, URGENCY_META } from "@/lib/task-urgency";
import { type LabelRow, labelOptions, defaultKey } from "@/lib/colors";
import { createTask, setTaskStatus, setTaskStage, setTaskShootDate, deleteTask } from "./actions";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { type Task, type TeamMember, toDateInputValue } from "./task-shared";
import { TaskAdminButton } from "./task-admin-panel";

// Vista Lista: todas las tareas en una tabla densa estilo Notion, ordenadas por fase.
export function TasksList({
  projectId,
  tasks,
  team,
  stages,
  statuses,
  priorities,
  isAdmin = false,
}: {
  projectId: string;
  tasks: Task[];
  team: TeamMember[];
  stages: string[];
  statuses: LabelRow[];
  priorities: LabelRow[];
  // Solo admins ven el botón ✏️ que abre el panel central de edición completa.
  isAdmin?: boolean;
}) {
  const cols = stages.length ? stages : ["Por hacer"];
  const stageOptions = cols.map((s) => ({ value: s, label: s }));
  const orderOf = (t: Task) => {
    const i = t.stage ? cols.indexOf(t.stage) : -1;
    return i < 0 ? cols.length : i;
  };
  // Orden: fase de producción → fecha de entrega (las sin fecha al final).
  const dueMs = (t: Task) => {
    const d = t.dueDate ? new Date(t.dueDate).getTime() : NaN;
    return Number.isNaN(d) ? Number.POSITIVE_INFINITY : d;
  };
  const sorted = [...tasks].sort((a, b) => orderOf(a) - orderOf(b) || dueMs(a) - dueMs(b));

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
            <th className="px-3 py-2 font-medium">📅 Entrega</th>
            <th className="px-3 py-2 font-medium">🎬 Rodaje</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-xs text-muted-foreground">
                Aún no hay tareas. Añade la primera abajo.
              </td>
            </tr>
          ) : null}
          {sorted.map((t) => {
            const u = taskUrgency({ dueDate: t.dueDate, completedAt: t.completedAt ?? null });
            const done = t.checklist.filter((c) => c.done).length;
            return (
              <tr key={t.id} className={cn("border-b border-border last:border-0", URGENCY_META[u.state].row)}>
                <td className="px-3 py-2">
                  <span className="font-medium">{t.title}</span>
                  {t.isDeliverableWork ? (
                    <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary" title="Ítem de entregable: se completa sola al mandar la versión a revisión">Entregable</span>
                  ) : null}
                  {t.breachedAt ? (
                    <span className="ml-2 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" title="El plazo del flujo de entregables se venció sin cumplirse">Incumplida</span>
                  ) : null}
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
                    options={labelOptions(statuses)}
                    action={setTaskStatus.bind(null, t.id, projectId)}
                  />
                </td>
                <td className="px-3 py-2">
                  <PriorityPill priorities={priorities} value={t.priority} />
                </td>
                <td className="px-3 py-2">
                  {t.assignee ? (
                    <UserAvatar initials={t.assignee.initials} color={t.assignee.avatarColor} size="sm" />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {t.dueDate ? (
                    <span
                      className={cn("text-[13px] font-medium", URGENCY_META[u.state].text)}
                      title={urgencyLabel(u.state, u.days)}
                    >
                      {formatShortDate(t.dueDate)}
                    </span>
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
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    {isAdmin ? (
                      <TaskAdminButton task={t} projectId={projectId} team={team} stages={cols} statuses={statuses} priorities={priorities} />
                    ) : null}
                    <form action={deleteTask.bind(null, t.id, projectId)}>
                      <ConfirmSubmit
                        message={`¿Eliminar la tarea «${t.title}»?`}
                        title="Eliminar"
                        className="px-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        ✕
                      </ConfirmSubmit>
                    </form>
                  </div>
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
        <input type="date" name="startDate" required defaultValue={todayInputValue()} title="Fecha de inicio" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
        <input type="date" name="dueDate" required title="Fecha de finalización" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
        <input type="time" name="dueTime" required defaultValue="09:00" title="Hora de entrega" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
        <select name="priority" defaultValue={defaultKey(priorities)} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs">
          {priorities.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        <select name="assigneeId" defaultValue="" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs">
          <option value="">Sin asignar</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Al crear un entregable podrás elegir esta tarea; se completa sola cuando el editor manda la versión a revisión">
          <input type="checkbox" name="isDeliverableWork" className="size-3.5 accent-[#F47A20]" />
          Entregable
        </label>
        <SubmitButton pendingText="…" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          Añadir
        </SubmitButton>
      </form>
    </div>
  );
}
