"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageProject, canWriteProject } from "@/lib/project-access";
import { safeExternalUrl } from "@/lib/url";
import { mimeFor } from "@/lib/storage";
import { saveBufferWithPreview } from "@/lib/image";
import { logActivity } from "@/lib/activity";
import { notify, notifyAndEmail } from "@/lib/notify";
import { deliverableStatusMeta } from "@/lib/ui";
import { statusLabelOf } from "@/lib/workflow-labels";
import { completionTransition } from "@/lib/task-completion";
import { noonUTC, todayKey, dayKey, parseHoursToMinutes, minutesToHours } from "@/lib/timeline";
import type { SessionUser } from "@/lib/session";

function refresh(projectId: string | null) {
  if (projectId) revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/mis-tareas");
  revalidatePath("/");
}

// Recalcula el progreso del proyecto = % de sus tareas completadas (completedAt != null).
// Se llama al completar/reabrir, crear o borrar tareas, para que la barra de progreso
// refleje el avance real sin gestión manual.
async function recalcProjectProgress(projectId: string | null) {
  if (!projectId) return;
  const [total, done] = await Promise.all([
    db.task.count({ where: { projectId } }),
    db.task.count({ where: { projectId, completedAt: { not: null } } }),
  ]);
  const progress = total ? Math.round((done / total) * 100) : 0;
  await db.project.update({ where: { id: projectId }, data: { progress } });
  revalidatePath("/proyectos");
}

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
} as const;

// Verifica permiso de ESCRITURA en un proyecto (mutaciones). Lanza si no. Devuelve la sesión.
// Los invitados (GUEST) son de solo lectura → no pueden crear/editar/borrar.
async function ensureProjectAccess(projectId: string): Promise<SessionUser> {
  const session = await getSession();
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project || !canWriteProject(project, session)) throw new Error("No autorizado");
  return session!;
}

// Para acciones sobre un recurso hijo: resuelve el projectId REAL del recurso (no se
// confía en el projectId que manda el cliente) y verifica acceso. Si el recurso no
// tiene proyecto (tarea personal/suelta), el acceso es de su dueño/responsable/admin.
type WithProject = {
  projectId: string | null;
  ownerId?: string | null;
  assigneeId?: string | null;
  project: { isPrivate: boolean; leadId: string | null; members: { userId: string; role: string }[] } | null;
} | null;
async function ensureAccessVia(resource: WithProject): Promise<string | null> {
  const session = await getSession();
  if (!resource || !session) throw new Error("No autorizado");
  if (resource.project) {
    if (!canWriteProject(resource.project, session)) throw new Error("No autorizado");
  } else {
    const ok = session.role === "admin" || resource.ownerId === session.id || resource.assigneeId === session.id;
    if (!ok) throw new Error("No autorizado");
  }
  return resource.projectId;
}

// Select reutilizable para resolver acceso a una tarea (de proyecto o personal).
const taskAccessSelect = {
  title: true,
  projectId: true,
  ownerId: true,
  assigneeId: true,
  project: { select: accessSelect },
} as const;

// ¿Puede cambiar PRIORIDAD y FECHA de entrega? Solo quien la creó (dueño), un
// admin o el responsable del proyecto. El responsable al que se la ASIGNARON no
// (se la dieron con esos datos). Si la creó para sí mismo, dueño = él → sí puede.
function canEditTaskMeta(
  task: { ownerId: string | null; project: { isPrivate: boolean; leadId: string | null; members: { userId: string; role: string }[] } | null },
  session: SessionUser | null,
): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (task.ownerId === session.id) return true;
  return !!task.project && canManageProject(task.project, session);
}

// ── Tareas ──
export async function createTask(projectId: string, formData: FormData) {
  await ensureProjectAccess(projectId);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;
  const priority = String(formData.get("priority") ?? "MEDIA");
  const stage = String(formData.get("stage") ?? "").trim() || null; // fase/columna del tablero
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueRaw ? new Date(`${dueRaw}T12:00:00.000Z`) : null;
  // Inicio y descripción opcionales (crear hoy, ejecutar después + documentar).
  const startRaw = String(formData.get("startDate") ?? "").trim();
  const startDate = startRaw ? new Date(`${startRaw}T12:00:00.000Z`) : null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const session = await getSession();
  const count = await db.task.count({ where: { projectId } });
  const task = await db.task.create({
    data: {
      projectId,
      title,
      description,
      assigneeId,
      priority: priority as never,
      stage,
      position: count,
      startDate,
      dueDate,
      ownerId: session?.id ?? null,
      assignedById: assigneeId ? session?.id ?? null : null,
    },
  });
  await logActivity({
    action: "task.create",
    summary: `creó la tarea «${title}»${stage ? ` en ${stage}` : ""}`,
    projectId,
    entityType: "task",
    entityId: task.id,
    // Al asignado le llega una notificación directa más abajo: evita el duplicado.
    exclude: assigneeId && assigneeId !== session?.id ? [assigneeId] : undefined,
  });
  // Si se asigna a alguien (que no soy yo) al crear → avísale.
  if (assigneeId && assigneeId !== session?.id) {
    await notifyAndEmail(assigneeId, {
      type: "task",
      title: `Nueva tarea: ${title}`,
      body: `Te asignaron una tarea${dueRaw ? ` (entrega ${dueRaw})` : ""}.`,
      link: `/proyectos/${projectId}?tab=tareas`,
    });
  }
  await recalcProjectProgress(projectId);
  refresh(projectId);
}

// Editar el nombre de la tarea (corrige typos).
export async function renameTask(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const title = String(formData.get("title") ?? "").trim();
  if (!title || title === task!.title) return;
  await db.task.update({ where: { id: taskId }, data: { title } });
  await logActivity({ action: "task.rename", summary: `renombró «${task!.title}» → «${title}»`, projectId, entityType: "task", entityId: taskId });
  refresh(projectId);
}

// Cambiar la prioridad de la tarea.
export async function setTaskPriority(taskId: string, _projectId: string, priority: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  if (!canEditTaskMeta(task!, await getSession())) throw new Error("Solo quien asignó la tarea puede cambiar la prioridad.");
  await db.task.update({ where: { id: taskId }, data: { priority: priority as never } });
  await logActivity({ action: "task.priority", summary: `cambió la prioridad de «${task!.title}» a ${priority}`, projectId, entityType: "task", entityId: taskId });
  refresh(projectId);
}

// Cambiar el responsable. Avisa (app + correo) al anterior y al nuevo.
export async function setTaskAssignee(taskId: string, _projectId: string, assigneeId: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const session = await getSession();
  const newId = assigneeId || null;
  if (newId) {
    const target = await db.user.findUnique({ where: { id: newId }, select: { active: true } });
    if (!target?.active) throw new Error("Usuario inválido");
  }
  const prevId = task!.assigneeId ?? null;
  if (prevId === newId) return;
  await db.task.update({ where: { id: taskId }, data: { assigneeId: newId, assignedById: session?.id ?? null } });
  const link = projectId ? `/proyectos/${projectId}?tab=tareas` : "/mis-tareas";
  if (newId && newId !== session?.id) {
    await notifyAndEmail(newId, { type: "task", title: `Te asignaron: ${task!.title}`, body: "Eres el nuevo responsable de esta tarea.", link });
  }
  if (prevId && prevId !== session?.id) {
    await notifyAndEmail(prevId, { type: "task", title: `Ya no eres responsable de: ${task!.title}`, body: "La tarea se reasignó a otra persona.", link });
  }
  await logActivity({ action: "task.assignee", summary: `reasignó la tarea «${task!.title}»`, projectId, entityType: "task", entityId: taskId });
  refresh(projectId);
}

// Fijar/limpiar la fecha de entrega. Avisa al responsable.
export async function setTaskDueDate(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  if (!canEditTaskMeta(task!, await getSession())) throw new Error("Solo quien asignó la tarea puede cambiar la fecha de entrega.");
  const raw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  await db.task.update({ where: { id: taskId }, data: { dueDate } });
  const session = await getSession();
  if (task!.assigneeId && task!.assigneeId !== session?.id) {
    await notifyAndEmail(task!.assigneeId, {
      type: "task",
      title: `Fecha de entrega: ${task!.title}`,
      body: raw
        ? `${session?.name ?? "Alguien"} cambió la entrega de tu tarea al ${raw}.`
        : `${session?.name ?? "Alguien"} quitó la fecha de entrega de tu tarea.`,
      link: projectId ? `/proyectos/${projectId}?tab=tareas` : "/mis-tareas",
    });
  }
  await logActivity({ action: "task.dueDate", summary: raw ? `fijó la entrega de «${task!.title}» el ${raw}` : `quitó la entrega de «${task!.title}»`, projectId, entityType: "task", entityId: taskId });
  refresh(projectId);
}

export async function setTaskStatus(taskId: string, _projectId: string, status: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const prev = await db.task.findUnique({ where: { id: taskId }, select: { completedAt: true } });
  const { completedAt, justCompleted } = await completionTransition(status, prev?.completedAt ?? null);
  await db.task.update({ where: { id: taskId }, data: { status, completedAt } });
  await recalcProjectProgress(projectId);
  await logActivity({
    action: justCompleted ? "task.complete" : "task.status",
    summary: justCompleted
      ? `completó la tarea «${task!.title}»`
      : `cambió el estado de «${task!.title}» a ${await statusLabelOf(status)}`,
    projectId,
    entityType: "task",
    entityId: taskId,
  });
  refresh(projectId);
}

// Mover una tarea a otra fase/columna del tablero.
export async function setTaskStage(taskId: string, _projectId: string, stage: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  // Al mover de columna, la ficha pasa al final (mayor posición del proyecto) para
  // que el orden quede estable tras recargar (antes conservaba su posición antigua).
  const last = await db.task.findFirst({ where: { projectId }, orderBy: { position: "desc" }, select: { position: true } });
  await db.task.update({ where: { id: taskId }, data: { stage: stage || null, position: (last?.position ?? 0) + 1 } });
  await logActivity({
    action: "task.stage",
    summary: `movió «${task!.title}» a ${stage || "la primera fase"}`,
    projectId,
    entityType: "task",
    entityId: taskId,
  });
  refresh(projectId);
}

// Fijar/limpiar la fecha de rodaje de una tarea (alimenta la vista de calendario).
export async function setTaskShootDate(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const raw = String(formData.get("shootDate") ?? "").trim();
  // input type=date → "YYYY-MM-DD"; se ancla a mediodía UTC para evitar saltos de día por zona horaria.
  const shootDate = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  await db.task.update({ where: { id: taskId }, data: { shootDate } });
  const session = await getSession();
  // Avisar (app + correo) al responsable del cambio de fecha de rodaje.
  if (task!.assigneeId && task!.assigneeId !== session?.id) {
    await notifyAndEmail(task!.assigneeId, {
      type: "task",
      title: `Fecha de rodaje: ${task!.title}`,
      body: raw
        ? `${session?.name ?? "Alguien"} fijó el rodaje de tu tarea el ${raw}.`
        : `${session?.name ?? "Alguien"} quitó la fecha de rodaje de tu tarea.`,
      link: projectId ? `/proyectos/${projectId}?tab=calendario` : "/mis-tareas",
    });
  }
  await logActivity({
    action: "task.shootDate",
    summary: raw ? `fijó el rodaje de «${task!.title}» el ${raw}` : `quitó la fecha de rodaje de «${task!.title}»`,
    projectId,
    entityType: "task",
    entityId: taskId,
  });
  refresh(projectId);
}

// ── Cronograma (Gantt) + seguimiento de horas ──

// Fija inicio y/o entrega a la vez (lo usa el arrastre/redimensionado de las barras).
// Semántica por campo: ausente → no se toca; "" → se borra; valor → se fija.
export async function setTaskDates(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  if (!canEditTaskMeta(task!, await getSession())) throw new Error("Solo quien asignó la tarea puede cambiar las fechas.");
  const data: { startDate?: Date | null; dueDate?: Date | null } = {};
  const sRaw = formData.get("startDate");
  const dRaw = formData.get("dueDate");
  if (sRaw !== null) data.startDate = String(sRaw).trim() ? noonUTC(String(sRaw).trim()) : null;
  if (dRaw !== null) data.dueDate = String(dRaw).trim() ? noonUTC(String(dRaw).trim()) : null;
  if (Object.keys(data).length === 0) return;
  await db.task.update({ where: { id: taskId }, data });
  const session = await getSession();

  // Descripción legible del cambio (qué fechas quedaron) para la notificación y el log.
  const parts: string[] = [];
  if ("startDate" in data) parts.push(data.startDate ? `inicio ${dayKey(data.startDate)}` : "sin inicio");
  if ("dueDate" in data) parts.push(data.dueDate ? `entrega ${dayKey(data.dueDate)}` : "sin entrega");
  const changeDesc = parts.join(" · ");

  // Avisar (app + correo) al responsable de la tarea con el detalle del cambio, salvo
  // que el cambio lo haya hecho él mismo.
  if (task!.assigneeId && task!.assigneeId !== session?.id) {
    await notifyAndEmail(task!.assigneeId, {
      type: "task",
      title: `Cambio de fechas: ${task!.title}`,
      body: `${session?.name ?? "Alguien"} movió tu tarea en el cronograma. Nuevas fechas: ${changeDesc || "actualizadas"}.`,
      link: projectId ? `/proyectos/${projectId}?tab=cronograma` : "/mis-tareas",
    });
  }
  await logActivity({ action: "task.dates", summary: `ajustó fechas de «${task!.title}» (${changeDesc})`, projectId, entityType: "task", entityId: taskId });
  revalidatePath("/timeline");
  refresh(projectId);
}

// Fija/limpia las horas estimadas de la tarea.
export async function setTaskEstimate(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const raw = String(formData.get("hours") ?? "").trim();
  const estimatedMinutes = raw ? parseHoursToMinutes(raw) : null;
  if (raw && estimatedMinutes == null) throw new Error("Horas inválidas");
  await db.task.update({ where: { id: taskId }, data: { estimatedMinutes } });
  await logActivity({
    action: "task.estimate",
    summary: estimatedMinutes ? `estimó «${task!.title}» en ${minutesToHours(estimatedMinutes)} h` : `quitó la estimación de «${task!.title}»`,
    projectId,
    entityType: "task",
    entityId: taskId,
  });
  refresh(projectId);
}

// Registra horas reales trabajadas (parte de horas). Cualquiera con acceso imputa las suyas.
export async function logTime(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const session = await getSession();
  const minutes = parseHoursToMinutes(String(formData.get("hours") ?? ""));
  if (!minutes || minutes <= 0) throw new Error("Horas inválidas");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  const dayRaw = String(formData.get("spentOn") ?? "").trim();
  const spentOn = dayRaw ? noonUTC(dayRaw) : noonUTC(todayKey());
  await db.timeEntry.create({ data: { taskId, userId: session?.id ?? null, minutes, note, spentOn } });
  await logActivity({ action: "task.time", summary: `registró ${minutesToHours(minutes)} h en «${task!.title}»`, projectId, entityType: "task", entityId: taskId });
  refresh(projectId);
}

export async function deleteTimeEntry(entryId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const entry = await db.timeEntry.findUnique({ where: { id: entryId }, select: { userId: true, task: { select: { projectId: true } } } });
  if (!entry) return;
  if (!(session.role === "admin" || entry.userId === session.id)) throw new Error("No autorizado");
  await db.timeEntry.delete({ where: { id: entryId } });
  refresh(entry.task.projectId);
}

export type TimeEntryItem = {
  id: string;
  minutes: number;
  note: string | null;
  spentOn: string;
  user: { name: string; initials: string | null; color: string | null } | null;
  mine: boolean;
};

export async function getTaskTimeEntries(taskId: string): Promise<TimeEntryItem[]> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  await ensureAccessVia(task);
  const session = await getSession();
  const rows = await db.timeEntry.findMany({
    where: { taskId },
    orderBy: { spentOn: "desc" },
    include: { user: { select: { id: true, name: true, initials: true, avatarColor: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    minutes: r.minutes,
    note: r.note,
    spentOn: r.spentOn.toISOString(),
    user: r.user ? { name: r.user.name, initials: r.user.initials, color: r.user.avatarColor } : null,
    mine: r.user?.id === session?.id,
  }));
}

// Fechas del proyecto (inicio/entrega) — alimentan el cronograma global. Editable desde
// el arrastre de la barra del proyecto en /timeline.
export async function setProjectDates(projectId: string, formData: FormData) {
  await ensureProjectAccess(projectId);
  const data: { startDate?: Date | null; dueDate?: Date | null } = {};
  const sRaw = formData.get("startDate");
  const dRaw = formData.get("dueDate");
  if (sRaw !== null) data.startDate = String(sRaw).trim() ? noonUTC(String(sRaw).trim()) : null;
  if (dRaw !== null) data.dueDate = String(dRaw).trim() ? noonUTC(String(dRaw).trim()) : null;
  if (Object.keys(data).length === 0) return;
  await db.project.update({ where: { id: projectId }, data });
  await logActivity({ action: "project.dates", summary: `ajustó las fechas del proyecto`, projectId, entityType: "project", entityId: projectId });
  revalidatePath("/timeline");
  revalidatePath("/proyectos");
  refresh(projectId);
}

export async function deleteTask(taskId: string, _projectId: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  await db.task.delete({ where: { id: taskId } });
  await recalcProjectProgress(projectId);
  await logActivity({
    action: "task.delete",
    summary: `eliminó la tarea «${task!.title}»`,
    projectId,
    entityType: "task",
    entityId: taskId,
  });
  refresh(projectId);
}

export async function toggleChecklistItem(itemId: string, _projectId: string, done: boolean) {
  const item = await db.checklistItem.findUnique({
    where: { id: itemId },
    select: { label: true, task: { select: taskAccessSelect } },
  });
  const projectId = await ensureAccessVia(item?.task ?? null);
  await db.checklistItem.update({ where: { id: itemId }, data: { done } });
  await logActivity({
    action: "checklist.toggle",
    summary: `${done ? "completó" : "reabrió"} «${item!.label}» en «${item!.task.title}»`,
    projectId,
    entityType: "task",
  });
  refresh(projectId);
}

export async function addChecklistItem(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;
  const count = await db.checklistItem.count({ where: { taskId } });
  await db.checklistItem.create({ data: { taskId, label, position: count } });
  await logActivity({
    action: "checklist.add",
    summary: `añadió «${label}» al checklist de «${task!.title}»`,
    projectId,
    entityType: "task",
    entityId: taskId,
  });
  refresh(projectId);
}

// Editar la descripción de la tarea.
export async function setTaskDescription(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const description = String(formData.get("description") ?? "").trim() || null;
  await db.task.update({ where: { id: taskId }, data: { description } });
  refresh(projectId);
}

export type TaskCommentItem = {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string; initials: string | null; color: string | null } | null;
  mine: boolean;
};

// Lee los comentarios de una tarea (verificando acceso).
export async function getTaskComments(taskId: string): Promise<TaskCommentItem[]> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  await ensureAccessVia(task);
  const session = await getSession();
  const rows = await db.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, initials: true, avatarColor: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    author: c.author ? { name: c.author.name, initials: c.author.initials, color: c.author.avatarColor } : null,
    mine: c.author?.id === session?.id,
  }));
}

// Añade un comentario a la tarea y avisa al dueño/responsable (menos al autor).
export async function addTaskComment(taskId: string, _projectId: string, formData: FormData): Promise<TaskCommentItem | null> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const session = await getSession();
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return null;
  const c = await db.taskComment.create({
    data: { taskId, authorId: session?.id ?? null, body },
    include: { author: { select: { name: true, initials: true, avatarColor: true } } },
  });
  const link = projectId ? `/proyectos/${projectId}?tab=tareas` : "/mis-tareas";
  const recipients = new Set<string>();
  if (task!.ownerId) recipients.add(task!.ownerId);
  if (task!.assigneeId) recipients.add(task!.assigneeId);
  recipients.delete(session?.id ?? "");
  for (const userId of recipients) {
    await notify(userId, { type: "task", title: `Comentario en «${task!.title}»`, body: body.slice(0, 140), link });
  }
  await logActivity({ action: "task.comment", summary: `comentó en «${task!.title}»`, projectId, entityType: "task", entityId: taskId });
  refresh(projectId);
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    author: c.author ? { name: c.author.name, initials: c.author.initials, color: c.author.avatarColor } : null,
    mine: true,
  };
}

// Borra un comentario propio (o admin).
export async function deleteTaskComment(commentId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const c = await db.taskComment.findUnique({ where: { id: commentId }, select: { authorId: true, task: { select: { projectId: true } } } });
  if (!c) return;
  if (!(session.role === "admin" || c.authorId === session.id)) throw new Error("No autorizado");
  await db.taskComment.delete({ where: { id: commentId } });
  refresh(c.task.projectId);
}

// ── Entregables ──
export async function createDeliverable(projectId: string, formData: FormData) {
  await ensureProjectAccess(projectId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const type = String(formData.get("type") ?? "REEL");
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueRaw ? new Date(`${dueRaw}T12:00:00.000Z`) : null;
  const d = await db.deliverable.create({ data: { projectId, name, type: type as never, dueDate } });
  await logActivity({ action: "deliverable.create", summary: `creó el entregable «${name}»`, projectId, entityType: "deliverable", entityId: d.id });
  refresh(projectId);
}

export async function setDeliverableStatus(id: string, _projectId: string, status: string) {
  const deliverable = await db.deliverable.findUnique({ where: { id }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(deliverable);
  await db.deliverable.update({ where: { id }, data: { status: status as never } });
  await logActivity({ action: "deliverable.status", summary: `cambió el estado del entregable «${deliverable!.name}» a ${deliverableStatusMeta(status).label}`, projectId, entityType: "deliverable", entityId: id });
  refresh(projectId);
}

export async function addDeliverableVersion(
  deliverableId: string,
  _projectId: string,
  formData: FormData,
) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  // Escritura (no solo lectura): un invitado GUEST no puede subir versiones.
  if (!deliverable || !canWriteProject(deliverable.project, session)) throw new Error("No autorizado");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const fileUrl = safeExternalUrl(String(formData.get("fileUrl") ?? ""));
  const last = await db.deliverableVersion.findFirst({
    where: { deliverableId },
    orderBy: { number: "desc" },
  });
  const number = (last?.number ?? 0) + 1;

  // Archivo subido (opcional): se guarda como FileAsset del proyecto y se vincula
  // a la versión, para que el portal del cliente pueda mostrarlo/reproducirlo.
  const file = formData.get("file");
  let fileAssetId: string | null = null;
  if (file instanceof File && file.size > 0 && file.size <= MAX_UPLOAD && !BLOCKED_EXT.test(file.name)) {
    const buf = Buffer.from(await file.arrayBuffer());
    const asset = await db.fileAsset.create({
      data: {
        projectId: deliverable.projectId,
        name: file.name,
        kind: "LOCAL",
        path: "",
        mime: mimeFor(file.name, file.type),
        size: buf.length,
        uploadedById: session!.id,
      },
    });
    const rel = await saveBufferWithPreview(`project/${deliverable.projectId}`, `${asset.id}-${file.name}`, buf, file.type);
    await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
    fileAssetId = asset.id;
  }

  await db.deliverableVersion.create({
    data: {
      deliverableId,
      number,
      notes,
      fileUrl,
      fileAssetId,
      uploadedById: session!.id,
      // Pendiente de pre-aprobación interna (no llega al cliente hasta aprobarla).
      internalApproved: false,
    },
  });
  // La nueva versión pasa a revisión interna (compuerta bloqueante).
  await db.deliverable.update({ where: { id: deliverableId }, data: { status: "REVISION_INTERNA" } });
  await logActivity({ action: "deliverable.version", summary: `subió la versión v${number} de «${deliverable.name}» (pendiente de pre-aprobación interna)`, projectId: deliverable.projectId, entityType: "deliverable", entityId: deliverableId });
  refresh(deliverable.projectId);
}

// ── Decisiones de pre-aprobación interna (equipo) ──
// Aprueba o solicita cambios sobre una versión. Solo al aprobar internamente la
// versión puede compartirse con el cliente (compuerta bloqueante).
export async function internalDecision(
  deliverableId: string,
  _projectId: string,
  versionNumber: number,
  result: "APROBADO" | "CAMBIOS",
  note?: string,
) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) throw new Error("No autorizado");
  const projectId = deliverable.projectId;
  const approved = result === "APROBADO";

  await db.deliverableDecision.create({
    data: { deliverableId, versionNumber, stage: "INTERNA", result, byUserId: session!.id, note: note?.slice(0, 1000) || null },
  });
  if (approved) {
    await db.deliverableVersion.updateMany({ where: { deliverableId, number: versionNumber }, data: { internalApproved: true, internalApprovedAt: new Date() } });
    await db.deliverable.update({ where: { id: deliverableId }, data: { status: "ENVIADO_CLIENTE" } });
  } else {
    await db.deliverable.update({ where: { id: deliverableId }, data: { status: "CORRECCIONES" } });
  }
  await logActivity({
    action: "deliverable.preapproval",
    summary: approved
      ? `aprobó internamente la v${versionNumber} de «${deliverable.name}»`
      : `solicitó cambios internos en la v${versionNumber} de «${deliverable.name}»`,
    projectId,
    entityType: "deliverable",
    entityId: deliverableId,
  });
  refresh(projectId);
}

// Revocar / restaurar el enlace de revisión del cliente.
export async function setReviewRevoked(deliverableId: string, _projectId: string, revoked: boolean) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) throw new Error("No autorizado");
  await db.deliverable.update({ where: { id: deliverableId }, data: { reviewRevokedAt: revoked ? new Date() : null } });
  await logActivity({ action: "deliverable.review_link", summary: revoked ? `revocó el enlace de revisión de «${deliverable.name}»` : `reactivó el enlace de revisión de «${deliverable.name}»`, projectId: deliverable.projectId, entityType: "deliverable", entityId: deliverableId });
  refresh(deliverable.projectId);
}

// Activar / desactivar el modo dibujos (anotación) en el portal del cliente.
export async function setReviewDrawings(deliverableId: string, _projectId: string, allow: boolean) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) throw new Error("No autorizado");
  await db.deliverable.update({ where: { id: deliverableId }, data: { reviewAllowDrawings: allow } });
  refresh(deliverable.projectId);
}

// Marcar/desmarcar como resuelto un comentario del cliente.
export async function resolveReviewComment(commentId: string, _projectId: string, resolved: boolean) {
  const c = await db.reviewComment.findUnique({ where: { id: commentId }, select: { deliverable: { select: { projectId: true, project: { select: accessSelect } } } } });
  const session = await getSession();
  if (!c || !canWriteProject(c.deliverable.project, session)) throw new Error("No autorizado");
  await db.reviewComment.update({ where: { id: commentId }, data: { resolved } });
  refresh(c.deliverable.projectId);
}

// Respuesta del equipo a la revisión del cliente (se ve en el portal público).
export async function replyToReview(deliverableId: string, _projectId: string, formData: FormData) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canWriteProject(deliverable.project, session)) throw new Error("No autorizado");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return;
  const me = await db.user.findUnique({ where: { id: session!.id }, select: { name: true } });
  await db.reviewComment.create({
    data: { deliverableId, authorName: me?.name ?? "Equipo", body, fromClient: false },
  });
  await logActivity({ action: "deliverable.team_reply", summary: `respondió en la revisión de «${deliverable.name}»`, projectId: deliverable.projectId, entityType: "deliverable", entityId: deliverableId });
  refresh(deliverable.projectId);
}

// ── Archivos ──
export async function addFile(projectId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId);
  const name = String(formData.get("name") ?? "").trim();
  const url = safeExternalUrl(String(formData.get("url") ?? ""));
  if (!name || !url) return;
  const folderId = String(formData.get("folderId") ?? "") || null;
  const kind = url.includes("drive.google.com") ? "DRIVE" : "LINK";
  const f = await db.fileAsset.create({
    data: { projectId, name, url, folderId, kind, uploadedById: session.id },
  });
  await logActivity({ action: "file.link", summary: `añadió el enlace «${name}»`, projectId, entityType: "file", entityId: f.id });
  refresh(projectId);
}

// Subir archivos LOCALES al proyecto (se guardan en el storage del NAS y se pueden
// editar con OnlyOffice). Distinto de addFile, que solo guarda enlaces.
// Extensiones ejecutables/peligrosas que no se permiten subir.
const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|scr|pif|cpl|jar|js|vbs|ps1|sh|app|dmg|deb|rpm)$/i;
const MAX_UPLOAD = 100 * 1024 * 1024; // 100 MB por archivo (coincide con bodySizeLimit)

export async function uploadProjectFiles(projectId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId);
  const folderId = String(formData.get("folderId") ?? "") || null;
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX_UPLOAD && !BLOCKED_EXT.test(f.name));
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const asset = await db.fileAsset.create({
      data: {
        projectId,
        name: file.name,
        kind: "LOCAL",
        path: "",
        mime: mimeFor(file.name, file.type),
        size: buf.length,
        folderId,
        uploadedById: session.id,
      },
    });
    const rel = await saveBufferWithPreview(`project/${projectId}`, `${asset.id}-${file.name}`, buf, file.type);
    await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
    await logActivity({ action: "file.upload", summary: `subió el archivo «${file.name}»`, projectId, entityType: "file", entityId: asset.id });
  }
  refresh(projectId);
}

export async function deleteFile(fileId: string, _projectId: string) {
  const file = await db.fileAsset.findUnique({ where: { id: fileId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(file);
  await db.fileAsset.delete({ where: { id: fileId } });
  await logActivity({ action: "file.delete", summary: `eliminó el archivo «${file!.name}»`, projectId, entityType: "file", entityId: fileId });
  refresh(projectId);
}

// ── Carpetas (personalizables: nombre, icono, color; se pueden crear y borrar) ──
export async function createFolder(projectId: string, formData: FormData) {
  await ensureProjectAccess(projectId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const count = await db.projectFolder.count({ where: { projectId } });
  // Carrera/duplicado: el @@unique(projectId,name) protege; capturamos P2002 para no romper.
  try {
    await db.projectFolder.create({ data: { projectId, name, icon, color, position: count } });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return; // ya existe una carpeta con ese nombre
    throw e;
  }
  await logActivity({ action: "folder.create", summary: `creó la carpeta «${name}»`, projectId, entityType: "folder" });
  refresh(projectId);
}

export async function updateFolder(folderId: string, _projectId: string, formData: FormData) {
  const folder = await db.projectFolder.findUnique({ where: { id: folderId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(folder);
  const name = String(formData.get("name") ?? "").trim() || folder!.name;
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  await db.projectFolder.update({ where: { id: folderId }, data: { name, icon, color } });
  await logActivity({ action: "folder.update", summary: `editó la carpeta «${name}»`, projectId, entityType: "folder", entityId: folderId });
  refresh(projectId);
}

export async function deleteFolder(folderId: string, _projectId: string) {
  const folder = await db.projectFolder.findUnique({ where: { id: folderId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(folder);
  // Los archivos de la carpeta quedan "sin carpeta" (folderId → null por onDelete: SetNull).
  await db.projectFolder.delete({ where: { id: folderId } });
  await logActivity({ action: "folder.delete", summary: `eliminó la carpeta «${folder!.name}»`, projectId, entityType: "folder", entityId: folderId });
  refresh(projectId);
}

// ── Proyecto compartido: visibilidad y miembros (solo gestores) ──
async function ensureProjectManage(projectId: string): Promise<SessionUser> {
  const session = await getSession();
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project || !canManageProject(project, session)) throw new Error("No autorizado");
  return session!;
}

// ── Fases del tablero (columnas personalizables: añadir, renombrar, borrar, color) ──
export async function addStage(projectId: string, formData: FormData) {
  await ensureProjectAccess(projectId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { stages: true } });
  const stages = project?.stages ?? [];
  if (stages.includes(name)) return;
  await db.project.update({ where: { id: projectId }, data: { stages: [...stages, name] } });
  await logActivity({ action: "stage.add", summary: `añadió la fase «${name}»`, projectId, entityType: "project", entityId: projectId });
  refresh(projectId);
}

export async function renameStage(projectId: string, oldName: string, newName: string) {
  await ensureProjectAccess(projectId);
  const name = newName.trim();
  if (!name || name === oldName) return;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { stages: true, stageColors: true } });
  if (!project) return;
  const stages = project.stages.map((s) => (s === oldName ? name : s));
  const colors = (project.stageColors as Record<string, string> | null) ?? {};
  if (colors[oldName]) { colors[name] = colors[oldName]; delete colors[oldName]; }
  await db.project.update({ where: { id: projectId }, data: { stages, stageColors: colors as never } });
  await db.task.updateMany({ where: { projectId, stage: oldName }, data: { stage: name } });
  await logActivity({ action: "stage.rename", summary: `renombró la fase «${oldName}» → «${name}»`, projectId, entityType: "project", entityId: projectId });
  refresh(projectId);
}

export async function deleteStage(projectId: string, name: string) {
  await ensureProjectAccess(projectId);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { stages: true, stageColors: true } });
  if (!project || project.stages.length <= 1) return; // siempre queda al menos una fase
  const stages = project.stages.filter((s) => s !== name);
  const colors = (project.stageColors as Record<string, string> | null) ?? {};
  delete colors[name];
  await db.project.update({ where: { id: projectId }, data: { stages, stageColors: colors as never } });
  // Las tareas de la fase borrada pasan a la primera fase.
  await db.task.updateMany({ where: { projectId, stage: name }, data: { stage: stages[0] ?? null } });
  await logActivity({ action: "stage.delete", summary: `eliminó la fase «${name}»`, projectId, entityType: "project", entityId: projectId });
  refresh(projectId);
}

export async function setStageColor(projectId: string, stage: string, color: string) {
  await ensureProjectAccess(projectId);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { stageColors: true } });
  const colors = (project?.stageColors as Record<string, string> | null) ?? {};
  if (color) colors[stage] = color; else delete colors[stage];
  await db.project.update({ where: { id: projectId }, data: { stageColors: colors as never } });
  refresh(projectId);
}

// Color del proyecto (se usa en el calendario de proyectos). Cualquier miembro con acceso.
export async function setProjectColor(projectId: string, color: string) {
  await ensureProjectAccess(projectId);
  const safe = color || null;
  await db.project.update({ where: { id: projectId }, data: { color: safe } });
  await logActivity({ action: "project.color", summary: `cambió el color del proyecto`, projectId, entityType: "project", entityId: projectId });
  revalidatePath("/proyectos");
  refresh(projectId);
}

// Fecha de entrega de un entregable (alimenta el calendario de proyectos/clientes).
export async function setDeliverableDueDate(id: string, _projectId: string, formData: FormData) {
  const deliverable = await db.deliverable.findUnique({ where: { id }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(deliverable);
  const raw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  await db.deliverable.update({ where: { id }, data: { dueDate } });
  await logActivity({ action: "deliverable.dueDate", summary: raw ? `fijó la entrega de «${deliverable!.name}» el ${raw}` : `quitó la entrega de «${deliverable!.name}»`, projectId, entityType: "deliverable", entityId: id });
  revalidatePath("/proyectos");
  refresh(projectId);
}

export async function setProjectVisibility(projectId: string, isPrivate: boolean) {
  await ensureProjectManage(projectId);
  await db.project.update({ where: { id: projectId }, data: { isPrivate } });
  await logActivity({ action: "project.visibility", summary: `marcó el proyecto como ${isPrivate ? "privado" : "público"}`, projectId, entityType: "project", entityId: projectId });
  refresh(projectId);
}

export async function addProjectMember(projectId: string, userId: string, role: string = "MEMBER") {
  const session = await ensureProjectManage(projectId);
  // El rol debe ser uno conocido; conceder OWNER solo lo puede hacer admin o el responsable
  // (evita que un OWNER no-admin promueva a otros y escale control del proyecto).
  const allowed = ["MEMBER", "GUEST", "OWNER"];
  const safeRole = allowed.includes(role) ? role : "MEMBER";
  if (safeRole === "OWNER") {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { leadId: true } });
    if (!(session.role === "admin" || project?.leadId === session.id)) {
      throw new Error("Solo un administrador o el responsable puede asignar OWNER");
    }
  }
  // El usuario debe existir y estar activo (no se invita a ids arbitrarios).
  const target = await db.user.findUnique({ where: { id: userId }, select: { active: true } });
  if (!target?.active) throw new Error("Usuario inválido");

  await db.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role: safeRole as never },
    update: { role: safeRole as never },
  });
  const member = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await logActivity({ action: "member.add", summary: `añadió a ${member?.name ?? "un miembro"} como ${safeRole}`, projectId, entityType: "member", entityId: userId });
  refresh(projectId);
}

export async function removeProjectMember(projectId: string, userId: string) {
  await ensureProjectManage(projectId);
  await db.projectMember
    .delete({ where: { projectId_userId: { projectId, userId } } })
    .catch((e: { code?: string }) => {
      if (e?.code !== "P2025") throw e; // P2025 = no existe → ignorar; el resto propaga
    });
  const member = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await logActivity({ action: "member.remove", summary: `quitó a ${member?.name ?? "un miembro"} del proyecto`, projectId, entityType: "member", entityId: userId });
  refresh(projectId);
}
