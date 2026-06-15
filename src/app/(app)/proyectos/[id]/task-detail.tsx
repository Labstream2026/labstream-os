"use client";

import * as React from "react";
import { X, Send, Trash2 } from "lucide-react";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { ChecklistCheckbox } from "@/components/actions/checklist-checkbox";
import { UserAvatar } from "@/components/user-avatar";
import {
  renameTask,
  setTaskStatus,
  setTaskStage,
  setTaskPriority,
  setTaskAssignee,
  setTaskDueDate,
  setTaskShootDate,
  deleteTask,
  toggleChecklistItem,
  addChecklistItem,
  getTaskComments,
  addTaskComment,
  deleteTaskComment,
  type TaskCommentItem,
} from "./actions";
import { type Task, type TeamMember, toDateInputValue } from "./task-shared";
import { type LabelRow, labelOptions } from "@/lib/colors";

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
              <DateInput name="dueDate" value={toDateInputValue(task.dueDate)} action={setTaskDueDate.bind(null, task.id, projectId)} className="w-full" />
            </Field>
            <Field label="🎬 Fecha de rodaje">
              <DateInput name="shootDate" value={toDateInputValue(task.shootDate)} action={setTaskShootDate.bind(null, task.id, projectId)} className="w-full" />
            </Field>
          </div>

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

          {/* Eliminar */}
          <form action={deleteTask.bind(null, task.id, projectId)} className="border-t border-border pt-4">
            <button
              className="text-sm text-destructive hover:underline"
              onClick={(e) => { if (!confirm("¿Eliminar esta tarea? No se puede deshacer.")) e.preventDefault(); }}
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
