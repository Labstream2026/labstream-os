"use client";

import * as React from "react";
import Link from "next/link";
import { X, Trash2, Send } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { ChecklistCheckbox } from "@/components/actions/checklist-checkbox";
import { type LabelRow, labelOptions } from "@/lib/colors";
import { EntityEmoji } from "@/components/icons/marks";
import { TaskReminders } from "./task-reminders";
import {
  renameTask,
  setTaskStatus,
  setTaskPriority,
  setTaskAssignee,
  setTaskDueDate,
  setTaskDescription,
  toggleChecklistItem,
  addChecklistItem,
  getTaskComments,
  addTaskComment,
  deleteTaskComment,
  type TaskCommentItem,
} from "@/app/(app)/proyectos/[id]/actions";

export type DetailTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDateValue: string; // valor para <input type=date>
  projectId: string | null;
  projectName: string | null;
  projectEmoji: string | null;
  assigneeId: string | null;
  checklist: { id: string; label: string; done: boolean }[];
};

type TeamMember = { id: string; name: string };

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function TaskDetailButton({
  task,
  team,
  statuses,
  priorities,
  canEditMeta = true,
}: {
  task: DetailTask;
  team: TeamMember[];
  statuses: LabelRow[];
  priorities: LabelRow[];
  canEditMeta?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ver detalle"
        className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        Detalle
      </button>
      {open ? (
        <TaskDetailPanel task={task} team={team} statuses={statuses} priorities={priorities} canEditMeta={canEditMeta} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function TaskDetailPanel({
  task,
  team,
  statuses,
  priorities,
  canEditMeta,
  onClose,
}: {
  task: DetailTask;
  team: TeamMember[];
  statuses: LabelRow[];
  priorities: LabelRow[];
  canEditMeta: boolean;
  onClose: () => void;
}) {
  const projectId = task.projectId ?? "";
  const [comments, setComments] = React.useState<TaskCommentItem[] | null>(null);
  const [body, setBody] = React.useState("");
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    let alive = true;
    getTaskComments(task.id)
      .then((c) => { if (alive) setComments(c); })
      .catch(() => { if (alive) setComments([]); });
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
          {/* Nombre editable */}
          <form action={renameTask.bind(null, task.id, projectId)}>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Nombre</label>
            <input
              name="title"
              defaultValue={task.title}
              onBlur={(e) => { if (e.target.value.trim() && e.target.value !== task.title) e.target.form?.requestSubmit(); }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-ring"
            />
          </form>

          {task.projectName ? (
            <Link href={`/proyectos/${task.projectId}?tab=tareas`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <EntityEmoji value={task.projectEmoji} /> {task.projectName}
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">Tarea personal</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Estado">
              <StatusSelect value={task.status} options={labelOptions(statuses)} action={setTaskStatus.bind(null, task.id, projectId)} className="w-full" />
            </Field>
            <Field label="Prioridad">
              {canEditMeta ? (
                <StatusSelect value={task.priority} options={labelOptions(priorities)} action={setTaskPriority.bind(null, task.id, projectId)} className="w-full" />
              ) : (
                <span className="block rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground" title="La fija quien asignó la tarea">
                  {labelOptions(priorities).find((o) => o.value === task.priority)?.label ?? task.priority}
                </span>
              )}
            </Field>
            <Field label="Responsable">
              <select
                defaultValue={task.assigneeId ?? ""}
                onChange={(e) => setTaskAssignee(task.id, projectId, e.target.value)}
                className="w-full cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Sin asignar</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </Field>
            <Field label="📅 Fecha de entrega">
              {canEditMeta ? (
                <DateInput name="dueDate" value={task.dueDateValue} action={setTaskDueDate.bind(null, task.id, projectId)} className="w-full" />
              ) : (
                <span className="block rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground" title="La fija quien asignó la tarea">
                  {task.dueDateValue || "Sin fecha"}
                </span>
              )}
            </Field>
          </div>

          {!canEditMeta ? (
            <p className="-mt-2 flex items-start gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
              <span aria-hidden>🔒</span>
              <span>Las fechas y la prioridad las fija quien te asignó la tarea. Así tu cumplimiento se mantiene confiable.</span>
            </p>
          ) : null}

          {/* Descripción */}
          <form action={setTaskDescription.bind(null, task.id, projectId)}>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Descripción</label>
            <textarea
              name="description"
              defaultValue={task.description ?? ""}
              rows={3}
              placeholder="Añade detalles, contexto, enlaces…"
              onBlur={(e) => { if (e.target.value !== (task.description ?? "")) e.target.form?.requestSubmit(); }}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-0.5 text-[10px] text-muted-foreground">Se guarda al salir del campo.</p>
          </form>

          {/* Checklist */}
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Checklist {task.checklist.length > 0 ? `(${task.checklist.filter((c) => c.done).length}/${task.checklist.length})` : ""}
            </p>
            <div className="space-y-1">
              {task.checklist.map((c) => (
                <ChecklistCheckbox key={c.id} checked={c.done} label={c.label} action={toggleChecklistItem.bind(null, c.id, projectId)} />
              ))}
            </div>
            <form action={addChecklistItem.bind(null, task.id, projectId)} className="mt-2">
              <input name="label" placeholder="+ Añadir ítem" className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </form>
          </div>

          {/* Recordatorios (avísame antes de la entrega) */}
          <TaskReminders taskId={task.id} taskTitle={task.title} dueDateValue={task.dueDateValue} />

          {/* Comentarios */}
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Comentarios</p>
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
