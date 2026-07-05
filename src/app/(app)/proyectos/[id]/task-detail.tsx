"use client";

import * as React from "react";
import { X, Send, Trash2 } from "lucide-react";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { ChecklistCheckbox } from "@/components/actions/checklist-checkbox";
import { UserAvatar } from "@/components/user-avatar";
import {
  renameTask,
  setTaskDescription,
  setTaskStatus,
  setTaskStage,
  setTaskPriority,
  setTaskAssignee,
  setTaskDueDate,
  setTaskDueTime,
  setTaskDates,
  setTaskShootDate,
  setTaskEstimate,
  logTime,
  deleteTimeEntry,
  getTaskTimeEntries,
  deleteTask,
  toggleChecklistItem,
  addChecklistItem,
  getTaskComments,
  addTaskComment,
  deleteTaskComment,
  type TaskCommentItem,
  type TimeEntryItem,
} from "./actions";
import { type Task, type TeamMember, toDateInputValue } from "./task-shared";
import { type LabelRow, labelOptions } from "@/lib/colors";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatMinutes, minutesToHours, parseHoursToMinutes, todayKey } from "@/lib/timeline";
import { formatBogotaDate } from "@/lib/bogota-time";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

// Panel lateral para editar TODOS los campos de una tarea.
export function TaskDetail({
  task,
  projectId,
  team,
  stages,
  statuses,
  priorities,
  onClose,
}: {
  task: Task;
  projectId: string;
  team: TeamMember[];
  stages: string[];
  statuses: LabelRow[];
  priorities: LabelRow[];
  onClose: () => void;
}) {
  const stageOptions = (stages.length ? stages : ["Por hacer"]).map((s) => ({ value: s, label: s }));
  const curStage = task.stage && stages.includes(task.stage) ? task.stage : stages[0] ?? "Por hacer";
  const done = task.checklist.filter((c) => c.done).length;

  const [comments, setComments] = React.useState<TaskCommentItem[] | null>(null);
  const [body, setBody] = React.useState("");
  const [pending, start] = React.useTransition();
  const [actionErr, setActionErr] = React.useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();
  // Ejecuta una server action sin tumbar el panel (startTransition no atrapa rechazos).
  const runSafe = (fn: () => Promise<unknown>) =>
    start(async () => {
      try { setActionErr(null); await fn(); }
      catch (e) { setActionErr(e instanceof Error ? e.message : "No se pudo guardar el cambio."); }
    });

  React.useEffect(() => {
    let alive = true;
    getTaskComments(task.id).then((c) => { if (alive) setComments(c); }).catch(() => { if (alive) setComments([]); });
    return () => { alive = false; };
  }, [task.id]);

  function submitComment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    const fd = new FormData();
    fd.set("body", text);
    setBody("");
    start(async () => {
      const saved = await addTaskComment(task.id, projectId, fd);
      if (saved) setComments((prev) => [...(prev ?? []), saved]);
    });
  }
  function removeComment(id: string) {
    start(async () => {
      await deleteTaskComment(id);
      setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-muted-foreground">Detalle de tarea</span>
          <button onClick={onClose} aria-label="Cerrar" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-5 p-4">
          {dialog}
          {actionErr ? (
            <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{actionErr}</span>
              <button onClick={() => setActionErr(null)} className="shrink-0 font-medium hover:underline">Cerrar</button>
            </div>
          ) : null}
          {/* Nombre editable */}
          <form action={renameTask.bind(null, task.id, projectId)}>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nombre</label>
            <input
              name="title"
              defaultValue={task.title}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== task.title) e.target.form?.requestSubmit();
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
            />
          </form>

          {/* Descripción / notas fijas: el brief e instrucciones de la tarea (lo que antes se metía en
              el título). Es un solo texto COMPARTIDO: lo ve y edita todo el que puede ver la tarea. */}
          <form action={setTaskDescription.bind(null, task.id, projectId)}>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descripción / notas</label>
            <textarea
              name="description"
              defaultValue={task.description ?? ""}
              rows={4}
              placeholder="Brief, instrucciones, enlaces de referencia… lo ve todo el equipo."
              onBlur={(e) => { if (e.target.value.trim() !== (task.description ?? "").trim()) e.target.form?.requestSubmit(); }}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </form>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado">
              <StatusSelect value={task.status} options={labelOptions(statuses)} action={setTaskStatus.bind(null, task.id, projectId)} className="w-full" />
            </Field>
            <Field label="Fase">
              <StatusSelect value={curStage} options={stageOptions} action={setTaskStage.bind(null, task.id, projectId)} className="w-full" />
            </Field>
            <Field label="Prioridad">
              <StatusSelect value={task.priority} options={labelOptions(priorities)} action={setTaskPriority.bind(null, task.id, projectId)} className="w-full" />
            </Field>
            <Field label="Responsable">
              <select
                defaultValue={task.assigneeId ?? ""}
                onChange={(e) => runSafe(() => setTaskAssignee(task.id, projectId, e.target.value))}
                className="w-full cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Sin asignar</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>
            <Field label="🚦 Fecha de inicio">
              <DateInput name="startDate" value={toDateInputValue(task.startDate ?? null)} action={setTaskDates.bind(null, task.id, projectId)} className="w-full" />
            </Field>
            <Field label="📅 Fecha de entrega">
              <DateInput name="dueDate" value={toDateInputValue(task.dueDate)} action={setTaskDueDate.bind(null, task.id, projectId)} className="w-full" />
              <form action={setTaskDueTime.bind(null, task.id, projectId)} className="mt-1">
                <input
                  type="time"
                  name="dueTime"
                  defaultValue={task.dueTime ?? ""}
                  onChange={(e) => e.target.form?.requestSubmit()}
                  title="Hora de entrega: la tarea aparece en el calendario a esa hora"
                  className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </form>
            </Field>
            <Field label="🎬 Fecha de rodaje">
              <DateInput name="shootDate" value={toDateInputValue(task.shootDate)} action={setTaskShootDate.bind(null, task.id, projectId)} className="w-full" />
            </Field>
            <Field label="⏱ Horas estimadas">
              <form action={setTaskEstimate.bind(null, task.id, projectId)}>
                <input
                  name="hours"
                  defaultValue={task.estimatedMinutes ? minutesToHours(task.estimatedMinutes) : ""}
                  placeholder="ej. 4 o 2:30"
                  inputMode="decimal"
                  onBlur={(e) => e.target.form?.requestSubmit()}
                  className="w-full rounded-md border border-border bg-card px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
              </form>
            </Field>
          </div>

          <TimeTracking taskId={task.id} projectId={projectId} estimatedMinutes={task.estimatedMinutes ?? null} />

          {/* Checklist */}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Checklist {task.checklist.length > 0 ? `(${done}/${task.checklist.length})` : ""}</p>
            <div className="space-y-1">
              {task.checklist.map((c) => (
                <ChecklistCheckbox key={c.id} checked={c.done} label={c.label} action={toggleChecklistItem.bind(null, c.id, projectId)} />
              ))}
            </div>
            <form action={addChecklistItem.bind(null, task.id, projectId)} className="mt-2">
              <input name="label" placeholder="+ Añadir ítem" className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </form>
          </div>

          {/* Notas / comentarios: hilo COMPARTIDO. Cualquiera que pueda ver la tarea las ve; al
              publicar una, se avisa al responsable, al dueño y a quienes ya participaron. */}
          <div className="border-t border-border pt-4">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground">Notas del equipo</p>
              <span className="text-[10px] text-muted-foreground">· las ve todo el equipo</span>
            </div>
            <div className="space-y-3">
              {comments === null ? (
                <p className="text-xs text-muted-foreground">Cargando…</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sé el primero en comentar.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <UserAvatar initials={c.author?.initials ?? null} color={c.author?.color ?? null} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs">
                        <span className="font-medium">{c.author?.name ?? "Alguien"}</span>{" "}
                        <span suppressHydrationWarning className="text-muted-foreground">{timeAgo(c.createdAt)}</span>
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
                    </div>
                    {c.mine ? (
                      <button onClick={() => removeComment(c.id)} title="Borrar" className="self-start rounded p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <form onSubmit={submitComment} className="mt-3 flex items-end gap-2">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={2}
                placeholder="Escribe un comentario…"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); }}
                className="min-w-0 flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="submit" disabled={pending || !body.trim()} className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50" title="Enviar (⌘/Ctrl+Enter)">
                <Send className="size-4" />
              </button>
            </form>
          </div>

          {/* Eliminar */}
          <form action={deleteTask.bind(null, task.id, projectId)} className="border-t border-border pt-4">
            <button
              type="button"
              className="text-sm text-destructive hover:underline"
              onClick={async (e) => {
                // Capturamos el form ANTES del await (el evento se recicla tras el await).
                const form = e.currentTarget.form;
                if (await confirm({ title: "Eliminar tarea", message: "¿Eliminar esta tarea? No se puede deshacer.", confirmLabel: "Eliminar", danger: true })) form?.requestSubmit();
              }}
            >
              Eliminar tarea
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

// Registro de horas (parte de horas) de la tarea: estimado vs real + alta/baja de partes.
function TimeTracking({
  taskId,
  projectId,
  estimatedMinutes,
}: {
  taskId: string;
  projectId: string;
  estimatedMinutes: number | null;
}) {
  const [entries, setEntries] = React.useState<TimeEntryItem[] | null>(null);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    let alive = true;
    getTaskTimeEntries(taskId).then((e) => { if (alive) setEntries(e); }).catch(() => { if (alive) setEntries([]); });
    return () => { alive = false; };
  }, [taskId]);

  const logged = (entries ?? []).reduce((n, e) => n + e.minutes, 0);
  const pct = estimatedMinutes ? Math.min(100, Math.round((logged / estimatedMinutes) * 100)) : 0;
  const over = estimatedMinutes != null && logged > estimatedMinutes;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    // Validación inmediata en cliente: nada se envía si el valor no es un nº de horas > 0.
    // Da feedback al instante y evita "registré pero no pasó nada".
    const mins = parseHoursToMinutes(String(fd.get("hours") ?? ""));
    if (!mins || mins <= 0) {
      setErr("Escribe las horas como número, por ej. 1.5 o 1:30.");
      return;
    }
    setErr(null);
    start(async () => {
      try {
        await logTime(taskId, projectId, fd);
        form.reset();
        setEntries(await getTaskTimeEntries(taskId));
      } catch (e) {
        // No reseteamos el formulario: lo escrito queda intacto para reintentar sin perderlo.
        setErr(e instanceof Error ? e.message : "No se pudo registrar. Reintenta.");
      }
    });
  }
  function remove(id: string) {
    start(async () => {
      await deleteTimeEntry(id);
      setEntries((prev) => (prev ?? []).filter((x) => x.id !== id));
    });
  }

  return (
    <div className="border-t border-border pt-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">⏱ Tiempo</p>
        <p className="text-xs">
          <span className={cn("font-semibold", over && "text-destructive")}>{formatMinutes(logged)}</span>
          {estimatedMinutes ? <span className="text-muted-foreground"> / {formatMinutes(estimatedMinutes)}</span> : null}
        </p>
      </div>
      {estimatedMinutes ? (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      <form ref={formRef} onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <input
          name="hours"
          placeholder="Horas (ej. 1.5)"
          inputMode="decimal"
          className="w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          type="date"
          name="spentOn"
          defaultValue={todayKey()}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <input
          name="note"
          placeholder="Nota (opcional)"
          className="min-w-32 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? "Guardando…" : "Registrar"}
        </button>
      </form>
      {err ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">{err}</p>
      ) : null}

      <div className="mt-3 space-y-1.5">
        {entries === null ? (
          <p className="text-xs text-muted-foreground">Cargando…</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin horas registradas todavía.</p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-xs">
              <UserAvatar initials={e.user?.initials ?? null} color={e.user?.color ?? null} size="sm" />
              <span className="font-medium">{formatMinutes(e.minutes)}</span>
              <span className="text-muted-foreground">{formatBogotaDate(e.spentOn, { day: "numeric", month: "short" })}</span>
              {e.note ? <span className="min-w-0 flex-1 truncate text-muted-foreground">· {e.note}</span> : <span className="flex-1" />}
              {e.mine ? (
                <button onClick={() => remove(e.id)} title="Borrar" className="rounded p-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
