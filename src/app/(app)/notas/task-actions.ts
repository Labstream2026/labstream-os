"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { canWriteProject } from "@/lib/project-access";
import type { SessionUser } from "@/lib/session";
import { quickCreateFromText } from "@/lib/task-quick";
import { getTaskLabels } from "@/lib/workflow-labels";
import { completionTransition } from "@/lib/task-completion";
import { openBlockersOf, handleTaskCompleted } from "@/lib/task-unlock";
import { noteTaskLines, noteTaskKey } from "@/lib/note-tasks";

// ── El puente Notas → Tareas ──
// Una nota es donde se apunta rápido; una tarea es donde algo se hace. Aquí se cruza:
//  · una LÍNEA con casilla («- [ ] llamar al DF jueves 7am») se convierte en tarea usando el
//    MISMO motor de captura rápida que ya se usa en Mis tareas y en el proyecto (fechas en
//    español, @persona, #etiqueta, !prioridad, 2h) — no se inventa un parser nuevo;
//  · la NOTA ENTERA se convierte en una tarea con sus casillas como checklist;
//  · marcar la casilla en la nota completa la tarea, y completar la tarea marca la casilla.
// La tarea recuerda su origen con `noteId` + `noteLine` (el TEXTO de la línea, no el número:
// así el vínculo aguanta que la nota se reordene).

type NoteAccess = { id: string; content: string; title: string; projectId: string | null; createdById: string };

// Carga una nota que el usuario pueda gestionar (suya, o admin) y que no esté en la papelera.
async function loadOwnNote(id: string, session: { id: string; role: string }): Promise<NoteAccess | null> {
  const note = await db.note.findUnique({ where: { id }, select: { id: true, content: true, title: true, projectId: true, createdById: true, archivedAt: true } });
  if (!note || note.archivedAt) return null;
  if (note.createdById !== session.id && session.role !== "admin") return null;
  return note;
}

// El proyecto que hereda la tarea: el de la nota, si sigue VIVO y el usuario puede escribir
// en él. Si no (proyecto archivado, terminado o sin acceso), la tarea nace suelta en Mis
// tareas — mejor eso que perderla o colarla donde no toca.
async function inheritedProject(note: NoteAccess, session: SessionUser): Promise<string | null> {
  if (!note.projectId) return null;
  const project = await db.project.findUnique({
    where: { id: note.projectId },
    select: { id: true, isPrivate: true, leadId: true, archivedAt: true, finishedAt: true, members: { select: { userId: true, role: true } }, client: { select: { members: { select: { userId: true, role: true } } } } },
  });
  if (!project) return null;
  return canWriteProject(project, session) ? project.id : null;
}

// Convierte UNA línea con casilla en una tarea. Devuelve el vínculo para pintarlo al instante.
export async function createTaskFromNoteLine(
  noteId: string,
  line: number,
): Promise<{ ok: boolean; error?: string; task?: { id: string; title: string; key: string; href: string; done: boolean } }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  if (session.role === "cliente" || session.role === "demo") return { ok: false, error: "Sin permiso para crear tareas" };
  const note = await loadOwnNote(noteId, session);
  if (!note) return { ok: false, error: "La nota no existe" };

  const row = noteTaskLines(note.content).find((r) => r.line === line);
  if (!row || !row.text.trim()) return { ok: false, error: "Esa línea no es una tarea" };

  const key = noteTaskKey(row.text);
  // Idempotente: si ya se creó una tarea para esa línea, se devuelve la que hay.
  const already = await db.task.findFirst({ where: { noteId: note.id, noteLine: key }, select: { id: true, title: true, projectId: true, completedAt: true } });
  if (already) {
    return { ok: true, task: { id: already.id, title: already.title, key, href: taskHref(already), done: !!already.completedAt } };
  }

  const pid = await inheritedProject(note, session);
  const created = await quickCreateFromText(session, row.text, pid);
  if (!created.ok || !created.taskId) return { ok: false, error: created.error ?? "No se pudo crear la tarea" };

  await db.task.update({ where: { id: created.taskId }, data: { noteId: note.id, noteLine: key } });
  revalidatePath("/notas");
  revalidatePath("/mis-tareas");
  if (pid) revalidatePath(`/proyectos/${pid}`);
  return { ok: true, task: { id: created.taskId, title: created.title ?? row.text, key, href: taskHref({ id: created.taskId, projectId: pid }), done: false } };
}

// Convierte la NOTA ENTERA en una tarea: el título de la nota es el de la tarea, el texto va
// como descripción y cada casilla se vuelve un ítem del checklist.
export async function createTaskFromNote(noteId: string): Promise<{ ok: boolean; error?: string; taskId?: string; href?: string; items?: number }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  if (session.role === "cliente" || session.role === "demo") return { ok: false, error: "Sin permiso para crear tareas" };
  const note = await loadOwnNote(noteId, session);
  if (!note) return { ok: false, error: "La nota no existe" };

  const pid = await inheritedProject(note, session);
  const created = await quickCreateFromText(session, note.title, pid);
  if (!created.ok || !created.taskId) return { ok: false, error: created.error ?? "No se pudo crear la tarea" };

  const rows = noteTaskLines(note.content);
  await db.task.update({
    where: { id: created.taskId },
    data: {
      noteId: note.id,
      // El cuerpo de la nota queda como descripción (recortado; la nota sigue siendo la fuente).
      description: note.content.trim().slice(0, 4000) || null,
      ...(rows.length
        ? { checklist: { create: rows.map((r, i) => ({ label: r.text.slice(0, 200), done: r.done, position: i })) } }
        : {}),
    },
  });
  revalidatePath("/notas");
  revalidatePath("/mis-tareas");
  if (pid) revalidatePath(`/proyectos/${pid}`);
  return { ok: true, taskId: created.taskId, href: taskHref({ id: created.taskId, projectId: pid }), items: rows.length };
}

// Marcar/desmarcar la casilla de una línea que YA tiene tarea: completa o reabre esa tarea.
// Mismas reglas que Mis tareas (estado «Terminada» del catálogo, candado de dependencias,
// desbloqueo de las que dependían de ella).
export async function setNoteTaskDone(taskId: string, done: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  const task = await db.task.findUnique({ where: { id: taskId }, select: { title: true, assigneeId: true, ownerId: true, projectId: true, completedAt: true, status: true } });
  if (!task) return { ok: false, error: "La tarea no existe" };
  if (task.assigneeId !== session.id && task.ownerId !== session.id && session.role !== "admin") return { ok: false, error: "Sin permiso" };

  const { statuses } = await getTaskLabels();
  if (done) {
    const doneStatus = statuses.find((s) => s.isDone) ?? statuses[statuses.length - 1];
    if (!doneStatus) return { ok: false, error: "No hay estado de terminada configurado." };
    const blockers = await openBlockersOf(taskId);
    if (blockers.length) return { ok: false, error: `Bloqueada por «${blockers[0].title}»${blockers.length > 1 ? ` y ${blockers.length - 1} más` : ""}.` };
    const { completedAt, justCompleted } = await completionTransition(doneStatus.key, task.completedAt);
    await db.task.update({ where: { id: taskId }, data: { status: doneStatus.key as never, completedAt } });
    if (justCompleted) {
      await handleTaskCompleted(taskId, session.id);
      await logActivity({ action: "task.complete", summary: `completó la tarea «${task.title}» desde una nota`, projectId: task.projectId, entityType: "task", entityId: taskId });
    }
  } else {
    const open = statuses.find((s) => !s.isDone && s.isDefault) ?? statuses.find((s) => !s.isDone) ?? statuses[0];
    if (!open) return { ok: false, error: "No hay estado abierto configurado." };
    await db.task.update({ where: { id: taskId }, data: { status: open.key as never, completedAt: null } });
  }
  revalidatePath("/notas");
  revalidatePath("/mis-tareas");
  if (task.projectId) revalidatePath(`/proyectos/${task.projectId}`);
  return { ok: true };
}

// Enlace donde se ve la tarea: en su proyecto si lo tiene, o en Mis tareas.
function taskHref(t: { id: string; projectId: string | null }): string {
  return t.projectId ? `/proyectos/${t.projectId}?tab=tareas&tarea=${t.id}` : `/mis-tareas?tarea=${t.id}`;
}
