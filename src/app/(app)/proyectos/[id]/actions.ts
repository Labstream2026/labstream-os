"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject, canManageProject, canWriteProject } from "@/lib/project-access";
import { safeExternalUrl } from "@/lib/url";
import { mimeFor, signFileToken, saveBuffer } from "@/lib/storage";
import { APP_BASE, convertOfficeToText, officeType, onlyofficeEnabled } from "@/lib/onlyoffice";
import { emptyDocx } from "@/lib/docx";
import { saveBufferWithPreview } from "@/lib/image";
import { logActivity } from "@/lib/activity";
import { notify, notifyAndEmail, notifyMany, notifyManyAndEmail } from "@/lib/notify";
import { deliverableStatusMeta } from "@/lib/ui";
import { statusLabelOf } from "@/lib/workflow-labels";
import { completionTransition } from "@/lib/task-completion";
import { noonUTC, todayKey, dayKey, parseHoursToMinutes, minutesToHours } from "@/lib/timeline";
import type { SessionUser } from "@/lib/session";

function refresh(projectId: string | null) {
  if (projectId) revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/mis-tareas");
  revalidatePath("/revisiones");
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

// Brief de la propuesta del proyecto (qué se hará + entregables/compromisos). Visible a
// todo el equipo del proyecto; lo edita quien puede escribir el proyecto. Sin valores.
export async function updateProjectBrief(projectId: string, formData: FormData) {
  await ensureProjectAccess(projectId);
  const briefScope = String(formData.get("briefScope") ?? "").trim() || null;
  const briefDeliverables = String(formData.get("briefDeliverables") ?? "").trim() || null;
  await db.project.update({ where: { id: projectId }, data: { briefScope, briefDeliverables } });
  await logActivity({ action: "project.brief", summary: "actualizó la propuesta del proyecto (alcance/entregables)", projectId, entityType: "project", entityId: projectId });
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

// Indica si el usuario actual puede ESCRIBIR en el proyecto (crear tareas, editarlo…).
// Lo usa el botón flotante para mostrar solo las acciones que el usuario puede ejecutar
// en ESTE proyecto, en vez de fiarse de un permiso global. No lanza.
export async function getProjectCapabilities(projectId: string): Promise<{ canWrite: boolean }> {
  const session = await getSession();
  if (!session) return { canWrite: false };
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  return { canWrite: !!project && canWriteProject(project, session) };
}

// Devuelve los datos básicos de un proyecto para precargar el formulario de edición
// rápida (botón flotante). Requiere acceso de escritura al proyecto.
export async function getProjectBasics(projectId: string): Promise<{
  ok: boolean;
  project?: {
    name: string;
    emoji: string | null;
    description: string | null;
    status: string;
    priority: string;
    leadId: string | null;
    startDate: string;
    dueDate: string;
  };
}> {
  await ensureProjectAccess(projectId);
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true, emoji: true, description: true, status: true, priority: true, leadId: true, startDate: true, dueDate: true },
  });
  if (!p) return { ok: false };
  const toInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  return {
    ok: true,
    project: {
      name: p.name,
      emoji: p.emoji,
      description: p.description,
      status: p.status,
      priority: p.priority,
      leadId: p.leadId,
      startDate: toInput(p.startDate),
      dueDate: toInput(p.dueDate),
    },
  };
}

// Edita los datos básicos de un proyecto (nombre, emoji, responsable, estado, prioridad,
// fechas y descripción) desde el botón flotante de creación rápida.
export async function updateProject(projectId: string, formData: FormData) {
  await ensureProjectAccess(projectId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const emoji = String(formData.get("emoji") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const status = String(formData.get("status") ?? "").trim();
  const priority = String(formData.get("priority") ?? "MEDIA").trim();
  const leadId = String(formData.get("leadId") ?? "").trim() || null;
  const sRaw = String(formData.get("startDate") ?? "").trim();
  const dRaw = String(formData.get("dueDate") ?? "").trim();
  if (leadId) {
    const u = await db.user.findUnique({ where: { id: leadId }, select: { active: true } });
    if (!u?.active) throw new Error("Responsable inválido");
  }
  await db.project.update({
    where: { id: projectId },
    data: {
      name,
      emoji,
      description,
      priority,
      leadId,
      ...(status ? { status: status as never } : {}),
      startDate: sRaw ? noonUTC(sRaw) : null,
      dueDate: dRaw ? noonUTC(dRaw) : null,
    },
  });
  await logActivity({ action: "project.update", summary: `editó el proyecto «${name}»`, projectId, entityType: "project", entityId: projectId });
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
// Valida que un usuario sea miembro del proyecto (o su responsable) para poder ser
// "responsable de la revisión". Devuelve el id válido o null.
async function validateProjectMember(projectId: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const proj = await db.project.findUnique({ where: { id: projectId }, select: { leadId: true, members: { select: { userId: true } } } });
  const allowed = new Set([proj?.leadId, ...(proj?.members.map((m) => m.userId) ?? [])].filter(Boolean) as string[]);
  return allowed.has(userId) ? userId : null;
}

export async function createDeliverable(projectId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const type = String(formData.get("type") ?? "REEL");
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueRaw ? new Date(`${dueRaw}T12:00:00.000Z`) : null;
  // Caducidad opcional del enlace del cliente (si no se indica, no caduca).
  const expRaw = String(formData.get("reviewExpiresAt") ?? "").trim();
  const reviewExpiresAt = expRaw ? new Date(`${expRaw}T23:59:59.000Z`) : null;
  // Responsable de la revisión: solo se acepta si es miembro/responsable del proyecto.
  const reviewerId = await validateProjectMember(projectId, String(formData.get("reviewerId") ?? "").trim() || null);

  const d = await db.deliverable.create({ data: { projectId, name, type: type as never, dueDate, reviewExpiresAt, reviewerId, ownerId: session.id } });
  await logActivity({ action: "deliverable.create", summary: `creó el entregable «${name}»`, projectId, entityType: "deliverable", entityId: d.id });

  // Primera versión opcional en el mismo formulario (link externo o archivo subido).
  const fileUrl = safeExternalUrl(String(formData.get("fileUrl") ?? ""));
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0 && file.size <= MAX_UPLOAD && !BLOCKED_EXT.test(file.name);
  if (fileUrl || hasFile) {
    let fileAssetId: string | null = null;
    if (hasFile) {
      const f = file as File;
      const buf = Buffer.from(await f.arrayBuffer());
      const asset = await db.fileAsset.create({ data: { projectId, name: f.name, kind: "LOCAL", path: "", mime: mimeFor(f.name, f.type), size: buf.length, uploadedById: session.id } });
      const rel = await saveBufferWithPreview(`project/${projectId}`, `${asset.id}-${f.name}`, buf, f.type);
      await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
      fileAssetId = asset.id;
    }
    await db.deliverableVersion.create({ data: { deliverableId: d.id, number: 1, notes: null, fileUrl, fileAssetId, uploadedById: session.id, internalApproved: false } });
    await db.deliverable.update({ where: { id: d.id }, data: { status: "REVISION_INTERNA" } });
    await logActivity({ action: "deliverable.version", summary: `subió la v1 de «${name}» (pendiente de pre-aprobación interna)`, projectId, entityType: "deliverable", entityId: d.id });
    const lead = await db.project.findUnique({ where: { id: projectId }, select: { leadId: true, name: true } });
    await notifyManyAndEmail(
      [reviewerId, lead?.leadId].filter((x): x is string => Boolean(x) && x !== session.id),
      { type: "review", title: `Revisión pendiente: ${name}`, body: `${session.name} subió la v1 en «${lead?.name ?? ""}». Revísala y pre-apruébala o solicita cambios.`, link: `/revisiones/${d.id}` },
    );
  }
  refresh(projectId);
}

// Asigna/cambia el responsable de la revisión (solo miembros del proyecto).
export async function setDeliverableReviewer(deliverableId: string, _projectId: string, reviewerId: string | null) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) throw new Error("No autorizado");
  const valid = await validateProjectMember(deliverable.projectId, reviewerId);
  await db.deliverable.update({ where: { id: deliverableId }, data: { reviewerId: valid } });
  if (valid && valid !== session!.id) {
    await notifyAndEmail(valid, { type: "review", title: `Eres responsable de revisar: ${deliverable.name}`, body: "Te asignaron como responsable de la revisión de este entregable.", link: `/revisiones/${deliverableId}` });
  }
  refresh(deliverable.projectId);
}

// Fija o quita la caducidad del enlace del cliente (vacío = sin caducidad).
// Recibe FormData (lo dispara el <DateInput name="reviewExpiresAt">).
export async function setReviewExpiry(deliverableId: string, _projectId: string, formData: FormData) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) throw new Error("No autorizado");
  const dateStr = String(formData.get("reviewExpiresAt") ?? "").trim();
  const exp = dateStr ? new Date(`${dateStr}T23:59:59.000Z`) : null;
  await db.deliverable.update({ where: { id: deliverableId }, data: { reviewExpiresAt: exp } });
  refresh(deliverable.projectId);
}

// Borra el entregable COMPLETO (versiones, comentarios, decisiones; las tareas se
// desvinculan). Solo el responsable del proyecto o un admin.
export async function deleteDeliverable(deliverableId: string, _projectId: string) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) throw new Error("No autorizado");
  await db.deliverable.delete({ where: { id: deliverableId } });
  await logActivity({ action: "deliverable.delete", summary: `eliminó el entregable «${deliverable.name}»`, projectId: deliverable.projectId, entityType: "deliverable" });
  refresh(deliverable.projectId);
}

// Estados válidos del entregable (enum DeliverableStatus). Se valida la entrada para
// no permitir saltos directos a APROBADO/ENTREGADO con strings arbitrarios.
const DELIVERABLE_STATUSES = new Set([
  "PENDIENTE",
  "EN_PRODUCCION",
  "EN_EDICION",
  "REVISION_INTERNA",
  "ENVIADO_CLIENTE",
  "CORRECCIONES",
  "APROBADO",
  "ENTREGADO",
]);

export async function setDeliverableStatus(id: string, _projectId: string, status: string) {
  if (!DELIVERABLE_STATUSES.has(status)) throw new Error("Estado inválido");
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
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, ownerId: true, reviewerId: true, project: { select: { ...accessSelect, name: true } } } });
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
  // Aviso DIRIGIDO (in-app + correo) al responsable del proyecto y al dueño del
  // entregable: tienen una revisión pendiente. Se excluye a quien subió la versión.
  const directRecipients = [deliverable.reviewerId, deliverable.project.leadId, deliverable.ownerId]
    .filter((id) => id && id !== session!.id);
  // Los administradores pre-aprueban TODOS los entregables antes de enviarlos al cliente:
  // se les avisa de cada versión nueva aunque no sean responsables del proyecto y AUN SI
  // ellos mismos la subieron (por eso no se les excluye como al resto). notifyManyAndEmail
  // deduplica, así que un admin que además sea responsable recibe un solo aviso.
  const admins = await db.user.findMany({
    where: { active: true, role: { key: "admin" } },
    select: { id: true },
  });
  await notifyManyAndEmail(
    [...directRecipients, ...admins.map((a) => a.id)],
    {
      type: "review",
      title: `Revisión pendiente: ${deliverable.name}`,
      body: `${session!.name} subió la v${number} en «${deliverable.project.name}». Revísala y pre-apruébala o solicita cambios.`,
      link: `/revisiones/${deliverableId}`,
    },
  );
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
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, ownerId: true, reviewerId: true, project: { select: { ...accessSelect, name: true } } } });
  const session = await getSession();
  // Decide el responsable del proyecto/admin O el responsable de revisión asignado.
  const mayDecide = !!deliverable && (canManageProject(deliverable.project, session) || (!!deliverable.reviewerId && deliverable.reviewerId === session?.id));
  if (!deliverable || !mayDecide) throw new Error("No autorizado");
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
    // Sella los comentarios internos (borradores) de esta versión: pasan a ser el checklist
    // inmutable que trabaja el editor en Entregables. Ya no se pueden editar ni borrar.
    await db.reviewComment.updateMany({
      where: { deliverableId, versionNumber, fromClient: false, lockedAt: null },
      data: { lockedAt: new Date() },
    });
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
  // Al solicitar cambios, avisa a TODO el equipo del proyecto (responsable + miembros +
  // dueño del entregable) para que rehagan el material. Incluye cuántos cambios hay
  // pendientes y enlaza al workspace (donde está el checklist con capturas). Excluye a
  // quien decidió.
  if (!approved) {
    const changeCount = await db.reviewComment.count({
      where: { deliverableId, versionNumber, isNote: false, resolved: false },
    });
    await notifyManyAndEmail(
      [deliverable.project.leadId, deliverable.ownerId, ...deliverable.project.members.map((m) => m.userId)]
        .filter((id) => id && id !== session!.id),
      {
        type: "review",
        title: `Cambios solicitados: ${deliverable.name}`,
        body: `${session!.name} pidió cambios en la v${versionNumber} de «${deliverable.project.name}»${changeCount ? ` · ${changeCount} ${changeCount === 1 ? "punto" : "puntos"} en el checklist` : ""}.${note ? ` Nota: ${note.slice(0, 300)}` : ""}`,
        link: `/revisiones/${deliverableId}`,
      },
    );
  }
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

// Marcar/desmarcar un cambio del checklist como REALIZADO. Al marcarlo hecho, avisa
// (in-app) a todo el equipo del proyecto para que el responsable sepa que ese cambio
// puntual ya está resuelto. Desmarcar no notifica.
export async function resolveReviewComment(commentId: string, _projectId: string, resolved: boolean) {
  const c = await db.reviewComment.findUnique({
    where: { id: commentId },
    select: {
      deliverableId: true,
      body: true,
      deliverable: { select: { name: true, projectId: true, project: { select: { ...accessSelect, name: true } } } },
    },
  });
  const session = await getSession();
  if (!c || !canWriteProject(c.deliverable.project, session)) throw new Error("No autorizado");
  await db.reviewComment.update({ where: { id: commentId }, data: { resolved } });
  if (resolved) {
    const change = c.body.replace(/^\(anotación\)$/, "anotación").slice(0, 80);
    await notifyMany(
      [c.deliverable.project.leadId, ...c.deliverable.project.members.map((m) => m.userId)].filter(
        (id) => id && id !== session!.id,
      ),
      {
        type: "review",
        title: `Cambio realizado: ${c.deliverable.name}`,
        body: `${session!.name} marcó como hecho: «${change}»`,
        link: `/revisiones/${c.deliverableId}`,
      },
    );
  }
  // Sin revalidar: el cambio se refleja de forma optimista (no reinicia el video).
}

// Datos mínimos para autorizar editar/borrar un comentario de revisión.
async function reviewCommentForMutation(commentId: string) {
  return db.reviewComment.findUnique({
    where: { id: commentId },
    select: {
      fromClient: true,
      lockedAt: true,
      authorUserId: true,
      deliverable: { select: { project: { select: accessSelect } } },
    },
  });
}

// Edita el texto de un comentario interno de revisión. SOLO mientras es borrador
// (lockedAt == null), por su autor o quien gestiona el proyecto. Tras «Solicitar cambios»
// el comentario queda sellado e inmutable (es lo que trabaja el editor en Entregables).
export async function editReviewComment(commentId: string, _projectId: string, body: string) {
  const c = await reviewCommentForMutation(commentId);
  const session = await getSession();
  if (!c || !canWriteProject(c.deliverable.project, session)) throw new Error("No autorizado");
  const mine = c.authorUserId === session!.id;
  if (!mine && !canManageProject(c.deliverable.project, session)) throw new Error("No autorizado");
  if (c.fromClient || c.lockedAt) throw new Error("Este comentario ya está enviado y no se puede editar.");
  const next = body.trim().slice(0, 4000);
  if (!next) throw new Error("El comentario no puede quedar vacío.");
  await db.reviewComment.update({ where: { id: commentId }, data: { body: next } });
  // Sin revalidar: el workspace lo refleja de forma optimista (no reinicia el video).
}

// Borra un comentario interno de revisión, con las mismas reglas que editar.
export async function deleteReviewComment(commentId: string, _projectId: string) {
  const c = await reviewCommentForMutation(commentId);
  const session = await getSession();
  if (!c || !canWriteProject(c.deliverable.project, session)) throw new Error("No autorizado");
  const mine = c.authorUserId === session!.id;
  if (!mine && !canManageProject(c.deliverable.project, session)) throw new Error("No autorizado");
  if (c.fromClient || c.lockedAt) throw new Error("Este comentario ya está enviado y no se puede borrar.");
  await db.reviewComment.delete({ where: { id: commentId } });
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

// Comentario del EQUIPO en la revisión interna (bandeja /revisiones). Igual que el del
// cliente pero atribuido al usuario con sesión (fromClient=false). Soporta momento con
// captura del fotograma (drawingData), timecode y notas generales (isNote).
export async function addInternalReviewComment(deliverableId: string, formData: FormData) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canWriteProject(deliverable.project, session)) throw new Error("No autorizado");
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const isNote = formData.get("isNote") === "true";
  const tcRaw = String(formData.get("timecode") ?? "").trim();
  const versionRaw = String(formData.get("versionNumber") ?? "").trim();
  const drawingRaw = String(formData.get("drawingData") ?? "").trim();
  if (!body && !drawingRaw) return;

  let drawingData: unknown = undefined;
  if (!isNote && drawingRaw) {
    try {
      const parsed = JSON.parse(drawingRaw);
      if (drawingRaw.length <= 400_000) drawingData = parsed;
    } catch {
      /* ignora dibujos malformados */
    }
  }

  const me = await db.user.findUnique({ where: { id: session!.id }, select: { name: true } });
  await db.reviewComment.create({
    data: {
      deliverableId,
      authorUserId: session!.id,
      authorName: me?.name ?? "Equipo",
      body: body || "(anotación)",
      timecode: isNote ? null : tcRaw && Number.isFinite(Number(tcRaw)) ? Number(tcRaw) : null,
      versionNumber: versionRaw ? Number(versionRaw) : null,
      drawingData: (drawingData ?? undefined) as never,
      isNote,
      fromClient: false,
    },
  });
  await logActivity({ action: "deliverable.internal_comment", summary: `comentó en la revisión interna de «${deliverable.name}»`, projectId: deliverable.projectId, entityType: "deliverable", entityId: deliverableId });
  // Sin revalidar: el comentario aparece de forma optimista en ReviewStage para que el
  // reproductor no se reinicie. Al recargar, el servidor ya devuelve el comentario.
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

// ── Guiones (documentos de Word del proyecto) ──
// Los guiones viven en una carpeta dedicada «Guiones» del proyecto, separada de Archivos,
// para tener una pestaña enfocada con previsualización/edición en OnlyOffice y copia de texto.
const GUIONES_FOLDER = "Guiones";

async function ensureGuionesFolder(projectId: string): Promise<string> {
  const existing = await db.projectFolder.findFirst({ where: { projectId, name: GUIONES_FOLDER }, select: { id: true } });
  if (existing) return existing.id;
  const count = await db.projectFolder.count({ where: { projectId } });
  try {
    const folder = await db.projectFolder.create({ data: { projectId, name: GUIONES_FOLDER, icon: "🎬", position: count } });
    return folder.id;
  } catch (e) {
    // Carrera con otra subida: si ya existe (unique projectId+name), reúsala.
    if ((e as { code?: string })?.code === "P2002") {
      const f = await db.projectFolder.findFirst({ where: { projectId, name: GUIONES_FOLDER }, select: { id: true } });
      if (f) return f.id;
    }
    throw e;
  }
}

// Sube uno o varios documentos de Word como guiones del proyecto (solo formatos Word).
export async function uploadGuiones(projectId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId);
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX_UPLOAD && !BLOCKED_EXT.test(f.name))
    .filter((f) => officeType(f.name) === "word");
  if (!files.length) return;
  const folderId = await ensureGuionesFolder(projectId);
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
    await logActivity({ action: "file.upload", summary: `subió el guion «${file.name}»`, projectId, entityType: "file", entityId: asset.id });
  }
  refresh(projectId);
}

// Crea un documento de Word EN BLANCO como guion del proyecto (sin subir nada): genera
// un .docx válido y lo guarda en la carpeta «Guiones». Devuelve el id para abrirlo en
// OnlyOffice y empezar a editar de inmediato.
export async function createGuion(projectId: string, formData: FormData): Promise<{ ok: boolean; id?: string; error?: string }> {
  const session = await ensureProjectAccess(projectId);
  let name = String(formData.get("name") ?? "").trim() || "Guion sin título";
  if (!/\.docx$/i.test(name)) name = `${name}.docx`;
  const folderId = await ensureGuionesFolder(projectId);
  const buf = emptyDocx();
  const asset = await db.fileAsset.create({
    data: {
      projectId,
      name,
      kind: "LOCAL",
      path: "",
      mime: mimeFor(name),
      size: buf.length,
      folderId,
      uploadedById: session.id,
    },
  });
  const rel = await saveBuffer(`project/${projectId}`, `${asset.id}-${name}`, buf);
  await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
  await logActivity({ action: "file.upload", summary: `creó el guion «${name}»`, projectId, entityType: "file", entityId: asset.id });
  refresh(projectId);
  return { ok: true, id: asset.id };
}

// Extrae el texto plano de un guion (vía conversión de OnlyOffice) para copiarlo al
// portapapeles. Requiere acceso de LECTURA al proyecto.
export async function copyGuionText(fileId: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const file = await db.fileAsset.findUnique({
    where: { id: fileId },
    select: { name: true, version: true, path: true, project: { select: accessSelect } },
  });
  if (!file || !file.path) return { ok: false, error: "Guion no encontrado." };
  const session = await getSession();
  if (!file.project || !canAccessProject(file.project, session)) return { ok: false, error: "No autorizado." };
  if (!onlyofficeEnabled) return { ok: false, error: "OnlyOffice no está configurado: no se puede extraer el texto." };
  try {
    const token = signFileToken(fileId);
    const sourceUrl = `${APP_BASE}/api/files-asset/${fileId}?t=${token}`;
    const text = await convertOfficeToText({ fileId, name: file.name, version: file.version, sourceUrl });
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo extraer el texto." };
  }
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
