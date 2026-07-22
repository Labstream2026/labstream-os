"use server";

import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { isDeliverableStatus } from "@/lib/enum-guards";
import { accessibleProjectWhere, canAccessProject, canManageProject, canWriteProject } from "@/lib/project-access";
import { isDeliverableType, isProjectRole } from "@/lib/enum-guards";
import { safeExternalUrl } from "@/lib/url";
import { bogotaNoon } from "@/lib/today";
import { mimeFor, signFileToken, saveBuffer } from "@/lib/storage";
import { getOnlyOfficeConfig, convertOfficeToText, officeType } from "@/lib/onlyoffice";
import { emptyDocx } from "@/lib/docx";
import { saveBufferWithPreview, isOptimizableImage } from "@/lib/image";
import { claimChunkUpload } from "@/lib/chunked-claim";
import { logActivity } from "@/lib/activity";
import { notify, notifyAndEmail, notifyMany, notifyManyAndEmail, type NotifyInput } from "@/lib/notify";
import { parseTaskText } from "@/lib/task-parse";
import { getTaskLabels } from "@/lib/workflow-labels";
import { ymdPlus } from "@/lib/reminder-schedule";
import { openBlockersOf, handleTaskCompleted, wouldCreateCycle } from "@/lib/task-unlock";
import { syncTaskAnchoredAlerts } from "@/lib/reminder-alerts";
import { rateLimit } from "@/lib/rate-limit";
import { deliverableStatusMeta, statusMeta, DELIVERABLE_TYPE } from "@/lib/ui";
import { TONE_MAP } from "@/lib/colors";
import { validateAssignee } from "@/lib/task-assign";
import { ensureProjectChannels } from "@/lib/project-chat";
import { getOrCreateClientChannel } from "@/lib/client-chat";
import { statusLabelOf } from "@/lib/workflow-labels";
import { completionTransition } from "@/lib/task-completion";
import { closeDeliverableAutoTasks, createDeliverableAutoTask, createReviewTasksForReviewers, completeLinkedWorkTasks, autoTaskTitles, taskDueFromInstant } from "@/lib/deliverable-tasks";
import { defaultFixDeadline } from "@/lib/business-time";
import { formatBogota } from "@/lib/bogota-time";
import { sweepDeliverableSla } from "@/lib/deliverable-sla";
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
  // Ciclo de vida: con estos campos presentes, canWriteProject bloquea la escritura de proyectos
  // DORMIDOS (papelera/terminados) en TODAS las acciones que cargan el proyecto con este select.
  archivedAt: true,
  finishedAt: true,
} as const;

// Verifica permiso de ESCRITURA en un proyecto (mutaciones). Lanza si no. Devuelve la sesión.
// Los invitados (GUEST) son de solo lectura → no pueden crear/editar/borrar.
async function ensureProjectAccess(projectId: string, perm?: string): Promise<SessionUser> {
  const session = await getSession();
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project) noAutorizado();
  // Proyecto DORMIDO (papelera o terminado): ninguna escritura pasa — ni la excepción del
  // cliente de abajo—. Restaurar/Reabrir van por ensureProjectManage, no entran aquí.
  if (project.archivedAt || project.finishedAt) noAutorizado();
  if (!canWriteProject(project, session)) {
    // Excepción para el PORTAL DEL CLIENTE: un cliente (miembro GUEST de su proyecto) es de solo
    // lectura para casi todo, PERO puede ejecutar acciones para las que tiene permiso explícito
    // —subir su guion/archivos (subir_archivos)—. El resto (tareas, ajustes, equipos, cronograma)
    // sigue bloqueado porque su rol no tiene esos permisos. Las subidas de VERSIONES de entregable
    // llevan además su propio canWriteProject, así que siguen siendo solo del equipo.
    const isClienteMember = session?.role === "cliente" && perm != null && project.members.some((m) => m.userId === session.id);
    if (!(isClienteMember && hasPermission(session, perm!))) noAutorizado();
  }
  // Además del acceso al proyecto, exige el permiso del catálogo si se indica (admin pasa por bypass).
  if (perm && !hasPermission(session, perm)) noAutorizado();
  return session!;
}

// Para acciones sobre un recurso hijo: resuelve el projectId REAL del recurso (no se
// confía en el projectId que manda el cliente) y verifica acceso. Si el recurso no
// tiene proyecto (tarea personal/suelta), el acceso es de su dueño/responsable/admin.
type WithProject = {
  projectId: string | null;
  ownerId?: string | null;
  assigneeId?: string | null;
  // archivedAt/finishedAt opcionales: los loaders que usan accessSelect ya los traen y activan
  // el candado de proyecto dormido; los que no, se comportan como antes.
  project: { isPrivate: boolean; leadId: string | null; members: { userId: string; role: string }[]; archivedAt?: Date | null; finishedAt?: Date | null } | null;
} | null;
async function ensureAccessVia(resource: WithProject, perm: string | null = "editar_tareas"): Promise<string | null> {
  const session = await getSession();
  if (!resource || !session) noAutorizado();
  if (resource.project) {
    // Proyecto DORMIDO: nada de escribir sus tareas/recursos (tampoco vía excepción del cliente).
    if (resource.project.archivedAt || resource.project.finishedAt) noAutorizado();
    if (!canWriteProject(resource.project, session)) {
      // Cliente (portal): puede operar tareas de SU proyecto para las que tiene permiso explícito
      // (crear/editar tareas), aunque como GUEST sea de solo lectura para el resto (entregables,
      // equipos, brief siguen bloqueados porque su rol no tiene esos permisos).
      const isClienteMember = session.role === "cliente" && perm != null && resource.project.members.some((m) => m.userId === session.id);
      if (!(isClienteMember && hasPermission(session, perm))) noAutorizado();
    }
  } else {
    const ok = session.role === "admin" || resource.ownerId === session.id || resource.assigneeId === session.id;
    if (!ok) noAutorizado();
  }
  // Permiso del catálogo (por defecto editar_tareas) con BYPASS para el dueño o el asignado de
  // la propia tarea: un colaborador siempre puede editar/mover SU tarea aunque su rol no tenga
  // el permiso; para tareas de OTROS sí se exige. `perm: null` lo desactiva (getters, etc.).
  if (perm && !hasPermission(session, perm)) {
    const mine = resource.ownerId === session.id || resource.assigneeId === session.id;
    if (!mine) noAutorizado();
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
  // Admin y PRODUCTOR gestionan las tareas de todo el equipo (fechas, hora, prioridad).
  if (session.role === "admin" || session.role === "productor") return true;
  if (task.ownerId === session.id) return true;
  // Portal cliente = colaborador completo en SU proyecto: con gestionar_cronograma gestiona las
  // fechas/prioridad de las tareas del proyecto. ensureAccessVia ya validó membresía + permiso
  // antes de llegar aquí, así que el alcance queda acotado a sus proyectos.
  if (session.role === "cliente" && hasPermission(session, "gestionar_cronograma")) return true;
  return !!task.project && canManageProject(task.project, session);
}

// ── Tareas ──
export async function createTask(projectId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId, "crear_tareas");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const assigneeId = await validateAssignee(projectId, String(formData.get("assigneeId") ?? "") || null, session);
  const priority = String(formData.get("priority") ?? "MEDIA");
  const stage = String(formData.get("stage") ?? "").trim() || null; // fase/columna del tablero
  // Toda tarea lleva inicio y fin: el formulario los exige. Si por alguna vía no llegan
  // (automatismos/API), por defecto hoy, para que nunca queden vacíos.
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueRaw ? new Date(`${dueRaw}T12:00:00.000Z`) : bogotaNoon();
  const startRaw = String(formData.get("startDate") ?? "").trim();
  let startDate = startRaw ? new Date(`${startRaw}T12:00:00.000Z`) : bogotaNoon();
  const description = String(formData.get("description") ?? "").trim() || null;
  // Hora de finalización OBLIGATORIA al crear: si no llega una válida, por defecto 9:00 am.
  const dueTimeRaw = String(formData.get("dueTime") ?? "").trim();
  const dueTime = /^\d{1,2}:\d{2}$/.test(dueTimeRaw) ? dueTimeRaw : "09:00";
  // Coherencia: una tarea no puede empezar DESPUÉS de entregarse. Este formulario es un
  // <form action> sin manejo de error, así que LANZAR aquí tumbaba todo el tablero a la pantalla
  // gris. En su lugar se AJUSTA el inicio a la fecha de entrega (queda coherente, sin crash).
  if (startDate.getTime() > dueDate.getTime()) startDate = dueDate;
  // Ítem de ENTREGABLE: queda elegible en el desplegable al crear un entregable y se
  // completa sola cuando el editor manda la versión a pre-aprobación.
  const isDeliverableWork = formData.get("isDeliverableWork") === "on" || formData.get("isDeliverableWork") === "true";
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
      dueTime,
      isDeliverableWork,
      ownerId: session?.id ?? null,
      assignedById: assigneeId ? session?.id ?? null : null,
    },
  });
  // Si se asigna a alguien, asegúrale acceso al proyecto (añádelo como miembro si no lo era).
  if (assigneeId) {
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: assigneeId } },
      create: { projectId, userId: assigneeId },
      update: {},
    });
  }
  await logActivity({
    action: "task.create",
    summary: `creó la tarea «${title}»${stage ? ` en ${stage}` : ""}`,
    projectId,
    entityType: "task",
    entityId: task.id,
    // Al asignado le llega una notificación directa más abajo: evita el duplicado.
    exclude: assigneeId && assigneeId !== session?.id ? [assigneeId] : undefined,
  });
  // Si se asigna a alguien (que no soy yo) al crear → avísale, con el proyecto y el detalle.
  if (assigneeId && assigneeId !== session?.id) {
    const proj = await db.project.findUnique({ where: { id: projectId }, select: { name: true } });
    const body = [
      `Proyecto «${proj?.name ?? "—"}».`,
      description ? `\n${description.slice(0, 240)}` : "",
      dueRaw ? `\nEntrega: ${dueRaw}` : "",
    ].join("");
    await notifyAndEmail(assigneeId, {
      type: "task",
      event: "task_assigned",
      title: `Nueva tarea: ${title}`,
      body,
      link: `/proyectos/${projectId}?tab=tareas`,
      actorId: session?.id,
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
  await ensureProjectAccess(projectId, "editar_proyectos");
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
  // El responsable debe ser del equipo (nunca un cliente); si quien reasigna es un cliente, solo a
  // personas de su proyecto. validateAssignee ya exige que esté activo.
  const newId = await validateAssignee(projectId, assigneeId || null, session);
  const prevId = task!.assigneeId ?? null;
  if (prevId === newId) return;
  await db.task.update({ where: { id: taskId }, data: { assigneeId: newId, assignedById: session?.id ?? null } });
  // Garantiza acceso del NUEVO responsable: si no es miembro del proyecto, se añade. Sin esto, en
  // un proyecto privado se le asignaría la tarea pero no podría abrirla (ni el proyecto).
  if (projectId && newId) {
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: newId } },
      create: { projectId, userId: newId },
      update: {},
    });
  }
  const link = projectId ? `/proyectos/${projectId}?tab=tareas` : "/mis-tareas";
  if (newId && newId !== session?.id) {
    const info = await db.task.findUnique({ where: { id: taskId }, select: { description: true, dueDate: true, project: { select: { name: true } } } });
    const body = [
      info?.project?.name ? `Proyecto «${info.project.name}».` : "Eres el nuevo responsable de esta tarea.",
      info?.description ? `\n${info.description.slice(0, 240)}` : "",
      info?.dueDate ? `\nEntrega: ${info.dueDate.toISOString().slice(0, 10)}` : "",
    ].join("");
    await notifyAndEmail(newId, { type: "task", event: "task_assigned", title: `Te asignaron: ${task!.title}`, body, link, actorId: session?.id });
  }
  if (prevId && prevId !== session?.id) {
    await notifyAndEmail(prevId, { type: "task", event: "task_unassigned", title: `Ya no eres responsable de: ${task!.title}`, body: "La tarea se reasignó a otra persona.", link, actorId: session?.id });
  }
  await logActivity({ action: "task.assignee", summary: `reasignó la tarea «${task!.title}»`, projectId, entityType: "task", entityId: taskId });
  refresh(projectId);
}

// Fijar/limpiar la fecha de entrega. Avisa al responsable.
export async function setTaskDueDate(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task, "gestionar_cronograma");
  if (!canEditTaskMeta(task!, await getSession())) throw new Error("Solo quien asignó la tarea puede cambiar la fecha de entrega.");
  const raw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  // Coherencia: la entrega no puede quedar antes del inicio de la tarea.
  if (dueDate) {
    const cur = await db.task.findUnique({ where: { id: taskId }, select: { startDate: true } });
    if (cur?.startDate && cur.startDate.getTime() > dueDate.getTime()) {
      throw new Error("La fecha de entrega no puede ser anterior a la fecha de inicio.");
    }
  }
  // Si se quita la fecha de entrega, la hora de entrega deja de tener sentido → se limpia.
  await db.task.update({ where: { id: taskId }, data: dueDate ? { dueDate } : { dueDate: null, dueTime: null } });
  await syncTaskAnchoredAlerts(taskId); // recalcula los avisos «X antes» atados a la tarea a la nueva hora
  const session = await getSession();
  if (task!.assigneeId && task!.assigneeId !== session?.id) {
    await notifyAndEmail(task!.assigneeId, {
      type: "task",
      event: "task_due_date",
      title: `Fecha de entrega: ${task!.title}`,
      body: raw
        ? `${session?.name ?? "Alguien"} cambió la entrega de tu tarea al ${raw}.`
        : `${session?.name ?? "Alguien"} quitó la fecha de entrega de tu tarea.`,
      link: projectId ? `/proyectos/${projectId}?tab=tareas` : "/mis-tareas",
      actorId: session?.id,
    });
  }
  await logActivity({ action: "task.dueDate", summary: raw ? `fijó la entrega de «${task!.title}» el ${raw}` : `quitó la entrega de «${task!.title}»`, projectId, entityType: "task", entityId: taskId });
  refresh(projectId);
}

// Hora de finalización de la tarea ("HH:mm" o "" para quitar). Hace que la entrega aparezca en
// el calendario a esa hora en vez de "todo el día".
export async function setTaskDueTime(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task, "gestionar_cronograma");
  if (!canEditTaskMeta(task!, await getSession())) throw new Error("Solo quien asignó la tarea puede cambiar la hora de entrega.");
  const raw = String(formData.get("dueTime") ?? "").trim();
  const dueTime = /^\d{1,2}:\d{2}$/.test(raw) ? raw : null;
  await db.task.update({ where: { id: taskId }, data: { dueTime } });
  await syncTaskAnchoredAlerts(taskId); // la hora de entrega mueve el ancla de los avisos «X antes»
  await logActivity({ action: "task.dueTime", summary: dueTime ? `fijó la hora de entrega de «${task!.title}» a las ${dueTime}` : `quitó la hora de entrega de «${task!.title}»`, projectId, entityType: "task", entityId: taskId });
  revalidatePath("/calendario");
  refresh(projectId);
}

export async function setTaskStatus(taskId: string, _projectId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const prev = await db.task.findUnique({ where: { id: taskId }, select: { completedAt: true } });
  const { completedAt, justCompleted } = await completionTransition(status, prev?.completedAt ?? null);
  // CANDADO de dependencias: una tarea bloqueada no se completa (la UI puede burlarse; esto no).
  if (justCompleted) {
    const blockers = await openBlockersOf(taskId);
    if (blockers.length) {
      return { ok: false, error: `Bloqueada por «${blockers[0].title}»${blockers.length > 1 ? ` y ${blockers.length - 1} más` : ""}. Complétala(s) primero.` };
    }
  }
  await db.task.update({ where: { id: taskId }, data: { status, completedAt } });
  // Desbloqueo en cascada: avisa «te toca» a quien esperaba esta tarea.
  if (justCompleted) {
    const session = await getSession();
    await handleTaskCompleted(taskId, session?.id ?? null);
  }
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
  return { ok: true };
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
  const projectId = await ensureAccessVia(task, "gestionar_cronograma");
  const raw = String(formData.get("shootDate") ?? "").trim();
  // input type=date → "YYYY-MM-DD"; se ancla a mediodía UTC para evitar saltos de día por zona horaria.
  const shootDate = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  await db.task.update({ where: { id: taskId }, data: { shootDate } });
  const session = await getSession();
  // Avisar (app + correo) al responsable del cambio de fecha de rodaje.
  if (task!.assigneeId && task!.assigneeId !== session?.id) {
    await notifyAndEmail(task!.assigneeId, {
      type: "task",
      event: "task_shoot_date",
      title: `Fecha de rodaje: ${task!.title}`,
      body: raw
        ? `${session?.name ?? "Alguien"} fijó el rodaje de tu tarea el ${raw}.`
        : `${session?.name ?? "Alguien"} quitó la fecha de rodaje de tu tarea.`,
      link: projectId ? `/proyectos/${projectId}?tab=calendario` : "/mis-tareas",
      actorId: session?.id,
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
  const projectId = await ensureAccessVia(task, "gestionar_cronograma");
  if (!canEditTaskMeta(task!, await getSession())) throw new Error("Solo quien asignó la tarea puede cambiar las fechas.");
  const data: { startDate?: Date | null; dueDate?: Date | null } = {};
  const sRaw = formData.get("startDate");
  const dRaw = formData.get("dueDate");
  if (sRaw !== null) data.startDate = String(sRaw).trim() ? noonUTC(String(sRaw).trim()) : null;
  if (dRaw !== null) data.dueDate = String(dRaw).trim() ? noonUTC(String(dRaw).trim()) : null;
  if (Object.keys(data).length === 0) return;
  // Coherencia con el par EFECTIVO (lo que llega + lo que la tarea ya tenía).
  {
    const cur = await db.task.findUnique({ where: { id: taskId }, select: { startDate: true, dueDate: true } });
    const effStart = "startDate" in data ? data.startDate : cur?.startDate ?? null;
    const effDue = "dueDate" in data ? data.dueDate : cur?.dueDate ?? null;
    if (effStart && effDue && effStart.getTime() > effDue.getTime()) {
      throw new Error("La fecha de inicio no puede ser posterior a la fecha de entrega.");
    }
  }
  await db.task.update({ where: { id: taskId }, data });
  await syncTaskAnchoredAlerts(taskId); // reprogramar fechas recalcula los avisos «X antes» atados
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
      event: "task_schedule",
      title: `Cambio de fechas: ${task!.title}`,
      body: `${session?.name ?? "Alguien"} movió tu tarea en el cronograma. Nuevas fechas: ${changeDesc || "actualizadas"}.`,
      link: projectId ? `/proyectos/${projectId}?tab=cronograma` : "/mis-tareas",
      actorId: session?.id,
    });
  }
  await logActivity({ action: "task.dates", summary: `ajustó fechas de «${task!.title}» (${changeDesc})`, projectId, entityType: "task", entityId: taskId });
  revalidatePath("/timeline");
  refresh(projectId);
}

// Solo lectura: descripción de una tarea, para precargar el panel de edición admin.
export async function getTaskDescription(taskId: string): Promise<string> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { description: true, projectId: true, ownerId: true, assigneeId: true, project: { select: accessSelect } },
  });
  await ensureAccessVia(task, null);
  return task?.description ?? "";
}

// Edición INTEGRAL de una tarea por un ADMINISTRADOR (panel central): cambia varios campos a
// la vez y notifica al responsable anterior y al nuevo con el detalle claro de lo que cambió.
// Solo admins (los cambios de responsable y fechas son sensibles).
export async function adminUpdateTask(taskId: string, _projectId: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "productor")) return { ok: false, error: "Solo un administrador o productor puede editar la tarea completa." };
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      title: true, description: true, status: true, stage: true, priority: true,
      startDate: true, dueDate: true, dueTime: true, assigneeId: true, completedAt: true, projectId: true,
      project: { select: { name: true } },
      assignee: { select: { name: true } },
    },
  });
  if (!task) return { ok: false, error: "La tarea no existe." };
  const projectId = task.projectId;

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "El título no puede quedar vacío." };
  const newStatus = String(formData.get("status") ?? task.status);
  const newStage = String(formData.get("stage") ?? (task.stage ?? "")).trim();
  const newPriority = String(formData.get("priority") ?? task.priority);
  const newAssigneeId = String(formData.get("assigneeId") ?? "").trim() || null;
  const sRaw = String(formData.get("startDate") ?? "").trim();
  const dRaw = String(formData.get("dueDate") ?? "").trim();
  const descRaw = String(formData.get("description") ?? "");
  const newStart = sRaw ? noonUTC(sRaw) : null;
  const newDue = dRaw ? noonUTC(dRaw) : null;
  const tRaw = String(formData.get("dueTime") ?? "").trim();
  // Hora OBLIGATORIA cuando hay fecha de entrega: por defecto 9:00 am si no se indicó. Sin
  // fecha de entrega, no hay hora.
  const newDueTime = newDue ? (/^\d{1,2}:\d{2}$/.test(tRaw) ? tRaw : "09:00") : null;
  const newDesc = descRaw.trim() ? descRaw : null;

  // El responsable elegido debe existir, estar activo y ser del EQUIPO (nunca un usuario del portal
  // cliente: los clientes no son responsables de tareas).
  let newName: string | null = null;
  if (newAssigneeId) {
    const u = await db.user.findUnique({ where: { id: newAssigneeId }, select: { name: true, active: true, role: { select: { key: true } } } });
    if (!u?.active || u.role?.key === "cliente") return { ok: false, error: "El responsable elegido no es válido." };
    newName = u.name;
  }

  const prevId = task.assigneeId ?? null;
  const assigneeChanged = prevId !== newAssigneeId;
  const { completedAt } = await completionTransition(newStatus, task.completedAt ?? null);

  await db.task.update({
    where: { id: taskId },
    data: {
      title,
      description: newDesc,
      status: newStatus,
      stage: newStage || null,
      priority: newPriority,
      assigneeId: newAssigneeId,
      assignedById: assigneeChanged ? session.id : undefined,
      startDate: newStart,
      dueDate: newDue,
      dueTime: newDueTime,
      completedAt,
    },
  });
  await syncTaskAnchoredAlerts(taskId); // la edición admin puede mover fecha/hora → recalcular avisos

  // El nuevo responsable debe poder abrir el proyecto (aunque sea privado).
  if (projectId && newAssigneeId) {
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: newAssigneeId } },
      create: { projectId, userId: newAssigneeId },
      update: {},
    });
  }
  if (newStatus !== task.status) await recalcProjectProgress(projectId);

  // Resumen legible de lo que cambió (para la notificación y el registro).
  const fmt = (d: Date | null) => (d ? dayKey(d) : "—");
  const changes: string[] = [];
  if (title !== task.title) changes.push(`Título: «${task.title}» → «${title}»`);
  if (newStatus !== task.status) changes.push(`Estado: ${await statusLabelOf(task.status)} → ${await statusLabelOf(newStatus)}`);
  if ((task.stage ?? "") !== newStage) changes.push(`Fase: ${task.stage ?? "—"} → ${newStage || "—"}`);
  if (newPriority !== task.priority) changes.push(`Prioridad: ${task.priority} → ${newPriority}`);
  if (assigneeChanged) changes.push(`Responsable: ${task.assignee?.name ?? "Sin asignar"} → ${newName ?? "Sin asignar"}`);
  if (fmt(task.startDate) !== fmt(newStart)) changes.push(`Inicio: ${fmt(task.startDate)} → ${fmt(newStart)}`);
  if (fmt(task.dueDate) !== fmt(newDue)) changes.push(`Entrega: ${fmt(task.dueDate)} → ${fmt(newDue)}`);
  if ((task.dueTime ?? "") !== (newDueTime ?? "")) changes.push(`Hora de entrega: ${task.dueTime ?? "—"} → ${newDueTime ?? "—"}`);
  if ((task.description ?? "") !== (newDesc ?? "")) changes.push("Descripción actualizada");

  const link = projectId ? `/proyectos/${projectId}?tab=tareas` : "/mis-tareas";
  const proj = task.project?.name ? `Proyecto «${task.project.name}».\n` : "";
  const summary = changes.length ? changes.join("\n") : "Sin cambios.";

  // Avisar al NUEVO/actual responsable (si hubo cambios) y al ANTERIOR si se le retiró la tarea.
  if (newAssigneeId && newAssigneeId !== session.id && changes.length) {
    const head = assigneeChanged ? "Ahora eres responsable de esta tarea." : "Se actualizó tu tarea.";
    await notifyAndEmail(newAssigneeId, { type: "task", event: "task_updated", title: `Tarea actualizada: ${title}`, body: `${proj}${head}\n${summary}`, link, actorId: session.id }).catch(() => null);
  }
  if (assigneeChanged && prevId && prevId !== session.id && prevId !== newAssigneeId) {
    await notifyAndEmail(prevId, { type: "task", event: "task_reassigned", title: `Cambió tu tarea: ${title}`, body: `${proj}Ya no eres el responsable.\n${summary}`, link, actorId: session.id }).catch(() => null);
  }

  await logActivity({ action: "task.adminUpdate", summary: `editó la tarea «${title}»${changes.length ? ` (${changes.length} cambios)` : ""}`, projectId, entityType: "task", entityId: taskId });
  revalidatePath("/timeline");
  refresh(projectId);
  return { ok: true };
}

// ── Mover una tarea a OTRO proyecto ──
// Para cuando un proyecto evoluciona y se fragmenta: la tarea migra con todo lo suyo
// (checklist, comentarios, horas, etiquetas, seguidores) y sus archivos/enlaces ligados
// cambian de proyecto (salen de su carpeta, que era del origen). El vínculo con un
// entregable del origen se corta; la fase se conserva solo si existe una columna igual
// en el destino; la posición pasa al final del tablero destino. También sirve para
// llevar una tarea personal (sin proyecto) a un proyecto.

export type TaskMoveTarget = { id: string; name: string; clientName: string; sameClient: boolean };

// Proyectos a los que el usuario PUEDE mover la tarea (donde puede crear tareas, no
// archivados, distintos del actual), con los del MISMO cliente primero (el caso típico).
export async function getTaskMoveTargets(taskId: string): Promise<TaskMoveTarget[]> {
  const session = await getSession();
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      projectId: true, ownerId: true, assigneeId: true,
      project: { select: { isPrivate: true, leadId: true, clientId: true, members: { select: { userId: true, role: true } }, archivedAt: true, finishedAt: true } },
    },
  });
  await ensureAccessVia(task, null);
  const candidates = await db.project.findMany({
    // Destinos: solo proyectos VIVOS (a un terminado no se le mueven tareas; se reabre primero).
    where: { ...accessibleProjectWhere(session), finishedAt: null },
    select: {
      id: true, name: true, clientId: true, isPrivate: true, leadId: true,
      members: { select: { userId: true, role: true } },
      client: { select: { name: true } },
    },
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
  });
  const sourceClientId = task!.project?.clientId ?? null;
  return candidates
    .filter((p) => {
      if (p.id === task!.projectId) return false;
      if (canWriteProject(p, session)) return true;
      // Portal cliente: mueve entre SUS proyectos si tiene permiso de crear tareas (misma
      // excepción de ensureProjectAccess; como GUEST, canWriteProject le da false).
      return session?.role === "cliente" && hasPermission(session, "crear_tareas") && p.members.some((m) => m.userId === session.id);
    })
    .map((p) => ({ id: p.id, name: p.name, clientName: p.client.name, sameClient: p.clientId === sourceClientId }))
    // sort es estable: mismo cliente primero, conservando el orden cliente → proyecto.
    .sort((a, b) => Number(b.sameClient) - Number(a.sameClient));
}

export async function moveTaskToProject(taskId: string, targetProjectId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      title: true, stage: true, projectId: true, ownerId: true, assigneeId: true,
      project: { select: { isPrivate: true, leadId: true, name: true, members: { select: { userId: true, role: true } }, archivedAt: true, finishedAt: true } },
      equipmentPlan: { select: { id: true } },
    },
  });
  if (!task) return { ok: false, error: "La tarea no existe." };
  if (task.projectId === targetProjectId) return { ok: true };
  try {
    await ensureAccessVia(task);
  } catch {
    return { ok: false, error: "No tienes acceso a esta tarea." };
  }
  // Mover de proyecto es tan sensible como cambiar fechas/responsable: lo hace quien
  // gestiona la tarea (dueño, admin/productor, responsable del proyecto).
  if (!canEditTaskMeta(task, session)) return { ok: false, error: "Solo quien gestiona la tarea puede moverla de proyecto." };
  if (task.equipmentPlan) return { ok: false, error: "Esta tarea es el espejo de un plan de equipos del proyecto y no se puede mover." };

  // La compuerta del DESTINO es la misma que para crear una tarea allí.
  try {
    await ensureProjectAccess(targetProjectId, "crear_tareas");
  } catch {
    return { ok: false, error: "No puedes crear tareas en el proyecto destino." };
  }
  const target = await db.project.findUnique({ where: { id: targetProjectId }, select: { name: true, stages: true, archivedAt: true, finishedAt: true } });
  if (!target || target.archivedAt || target.finishedAt) return { ok: false, error: "El proyecto destino no existe o ya no está activo." };

  const stage = task.stage && target.stages.includes(task.stage) ? task.stage : null;
  const last = await db.task.findFirst({ where: { projectId: targetProjectId }, orderBy: { position: "desc" }, select: { position: true } });
  await db.task.update({
    where: { id: taskId },
    // deliverableId: el entregable pertenece al proyecto de origen → se desliga.
    data: { projectId: targetProjectId, stage, position: (last?.position ?? 0) + 1, deliverableId: null },
  });
  // Los archivos/enlaces ligados a la tarea la siguen (fuera de su carpeta de origen).
  await db.fileAsset.updateMany({ where: { taskId }, data: { projectId: targetProjectId, folderId: null } });
  // El responsable conserva el acceso: si no era miembro del destino, se añade.
  if (task.assigneeId) {
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId: targetProjectId, userId: task.assigneeId } },
      create: { projectId: targetProjectId, userId: task.assigneeId },
      update: {},
    });
  }
  // El % de avance de ambos proyectos cambia al mover la tarea.
  await recalcProjectProgress(task.projectId);
  await recalcProjectProgress(targetProjectId);

  const sourceName = task.project?.name ?? "Mis tareas (personal)";
  // UNA sola entrada de actividad (notifica al equipo del proyecto): en el ORIGEN, que es
  // donde el equipo seguía la tarea; si era personal, en el destino. Dos entradas duplicarían
  // el aviso para quienes están en ambos proyectos.
  await logActivity({
    action: "task.move",
    summary: `movió la tarea «${task.title}» de «${sourceName}» a «${target.name}»`,
    projectId: task.projectId ?? targetProjectId,
    entityType: "task",
    entityId: taskId,
    // El responsable recibe su notificación directa más abajo: evita el duplicado.
    exclude: task.assigneeId && task.assigneeId !== session?.id ? [task.assigneeId] : undefined,
  });
  if (task.assigneeId && task.assigneeId !== session?.id) {
    await notifyAndEmail(task.assigneeId, {
      type: "task",
      event: "task_moved",
      title: `Tu tarea cambió de proyecto: ${task.title}`,
      body: `${session?.name ?? "Alguien"} la movió de «${sourceName}» a «${target.name}».`,
      link: `/proyectos/${targetProjectId}?tab=tareas`,
      actorId: session?.id,
    }).catch(() => null);
  }
  revalidatePath(`/proyectos/${targetProjectId}`);
  revalidatePath("/timeline");
  refresh(task.projectId);
  return { ok: true };
}

// Fija/limpia las horas estimadas de la tarea.
export async function setTaskEstimate(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const raw = String(formData.get("hours") ?? "").trim();
  const estimatedMinutes = raw ? parseHoursToMinutes(raw) : null;
  // Texto no numérico ("abc", "medio día"): no-op en vez de lanzar — este campo viene de un
  // <form> que se auto-envía al salir (onBlur) y no maneja el error, así que un throw tumbaba
  // el panel de la tarea. Simplemente no se guarda nada.
  if (raw && estimatedMinutes == null) return;
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
  const projectId = await ensureAccessVia(task, "registrar_horas");
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
  if (!session) noAutorizado();
  const entry = await db.timeEntry.findUnique({ where: { id: entryId }, select: { userId: true, task: { select: { projectId: true } } } });
  if (!entry) return;
  if (!(session.role === "admin" || entry.userId === session.id)) noAutorizado();
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
  await ensureAccessVia(task, null);
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
  await ensureProjectAccess(projectId, "gestionar_cronograma");
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

// Reprograma un HITO del cronograma (chip de rodaje/entrega) al ARRASTRARLO a otro día. El id
// codifica el tipo y su objetivo: `shoot-<taskId>` (fecha de rodaje de una tarea) o
// `deliv-<deliverableId>` (fecha de entrega de un entregable). Actualiza la fecha (mediodía UTC,
// misma convención que el resto), refleja en el CALENDARIO (los rodajes son ítems del calendario)
// y avisa a los "citados": el asignado/dueño del rodaje o el dueño/revisores del entregable.
export async function rescheduleMilestone(id: string, dayKey: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;
  const session = await getSession();
  const when = noonUTC(dayKey);
  const fmtDay = new Date(`${dayKey}T00:00:00`).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });

  if (id.startsWith("shoot-")) {
    const taskId = id.slice("shoot-".length);
    const task = await db.task.findUnique({
      where: { id: taskId },
      select: { title: true, projectId: true, assigneeId: true, ownerId: true, project: { select: { ...accessSelect, name: true } } },
    });
    if (!task || !task.project || !canWriteProject(task.project, session)) noAutorizado();
    await db.task.update({ where: { id: taskId }, data: { shootDate: when } });
    await logActivity({ action: "task.shootDate", summary: `movió el rodaje de «${task!.title}» a ${fmtDay}`, projectId: task!.projectId, entityType: "task", entityId: taskId });
    const recipients = [...new Set([task!.assigneeId, task!.ownerId].filter((x): x is string => !!x && x !== session?.id))];
    if (recipients.length) {
      await notifyManyAndEmail(recipients, {
        type: "task", event: "task_shoot",
        title: `Rodaje reprogramado: ${task!.title}`,
        body: `Nueva fecha de rodaje · ${fmtDay} en «${task!.project!.name}»`,
        link: "/calendario", actorId: session?.id,
      });
    }
    revalidatePath("/calendario"); revalidatePath("/timeline");
    refresh(task!.projectId);
    return;
  }

  if (id.startsWith("deliv-")) {
    const delId = id.slice("deliv-".length);
    const d = await db.deliverable.findUnique({
      where: { id: delId },
      select: { name: true, projectId: true, ownerId: true, reviewerId: true, reviewers: { select: { userId: true } }, project: { select: { ...accessSelect, name: true } } },
    });
    if (!d || !canWriteProject(d.project, session)) noAutorizado();
    await db.deliverable.update({ where: { id: delId }, data: { dueDate: when } });
    await logActivity({ action: "deliverable.dueDate", summary: `movió la entrega de «${d!.name}» a ${fmtDay}`, projectId: d!.projectId, entityType: "deliverable", entityId: delId });
    const recipients = [...new Set([d!.ownerId, d!.reviewerId, ...d!.reviewers.map((r) => r.userId)].filter((x): x is string => !!x && x !== session?.id))];
    if (recipients.length) {
      await notifyManyAndEmail(recipients, {
        type: "review", event: "deliverable_due",
        title: `Entrega reprogramada: ${d!.name}`,
        body: `Nueva fecha de entrega · ${fmtDay} en «${d!.project.name}»`,
        link: `/proyectos/${d!.projectId}?tab=cronograma`, actorId: session?.id,
      });
    }
    revalidatePath("/calendario"); revalidatePath("/timeline");
    refresh(d!.projectId);
  }
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
  await ensureProjectAccess(projectId, "editar_proyectos");
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
  // Estado ANTERIOR: si cambia, se registra una actividad ESPECÍFICA además del genérico
  // (alimenta Actividad con nombre y los estados automáticos en el chat del proyecto).
  const prev = status ? await db.project.findUnique({ where: { id: projectId }, select: { status: true } }) : null;
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
  // UNA sola actividad por guardado (dos duplicarían la notificación a todo el equipo): si el
  // estado cambió, gana el evento específico (alimenta el espejo del chat y Actividad con nombre);
  // si no, el genérico de siempre.
  if (status && prev && status !== prev.status) {
    await logActivity({ action: "project.status", summary: `cambió el estado del proyecto a «${statusMeta(status).label}»`, projectId, entityType: "project", entityId: projectId });
  } else {
    await logActivity({ action: "project.update", summary: `editó el proyecto «${name}»`, projectId, entityType: "project", entityId: projectId });
  }
  revalidatePath("/timeline");
  revalidatePath("/proyectos");
  refresh(projectId);
}

// Edita SOLO nombre, descripción y fecha de entrega del proyecto, desde la ficha (pestaña
// Resumen). A diferencia de updateProject, NO toca estado, prioridad, responsable, emoji ni
// fecha de inicio: es una edición acotada para corregir el nombre/brief y reagendar la entrega.
// ── Mover el proyecto a OTRO cliente ──
// Gestión de cartera (proyectos creados bajo el cliente equivocado, reorganizaciones).
// SOLO el administrador. Qué arrastra el cambio:
//   · Todo lo que cuelga del proyecto (tareas, entregables, archivos, calendario, equipo
//     interno) se va con él — referencian projectId, no clientId.
//   · Los usuarios del PORTAL del cliente viejo se RETIRAN del proyecto (miembros GUEST y
//     revisores): si se quedaran, verían un proyecto que ya es de otro cliente.
//   · Los canales de chat se resincronizan (el del proyecto y las cuentas de ambos clientes).
//   · Cotizaciones y facturas NO se tocan: son historia comercial del cliente que las pagó.
export async function moveProjectToClient(projectId: string, targetClientId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Solo un administrador puede mover proyectos de cliente." };

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true, clientId: true, client: { select: { name: true } }, members: { select: { userId: true, user: { select: { role: { select: { key: true } } } } } } },
  });
  if (!project) return { ok: false, error: "El proyecto no existe." };
  if (project.clientId === targetClientId) return { ok: true };
  const target = await db.client.findUnique({ where: { id: targetClientId }, select: { name: true, archivedAt: true } });
  if (!target) return { ok: false, error: "El cliente destino no existe." };
  if (target.archivedAt) return { ok: false, error: "El cliente destino está archivado." };

  const oldClientId = project.clientId;
  // Usuarios del PORTAL (rol cliente) que participaban: pertenecen al cliente viejo.
  const portalIds = project.members.filter((m) => m.user.role?.key === "cliente").map((m) => m.userId);

  await db.project.update({ where: { id: projectId }, data: { clientId: targetClientId } });
  if (portalIds.length) {
    await db.projectMember.deleteMany({ where: { projectId, userId: { in: portalIds } } });
    await db.deliverableReviewer.deleteMany({ where: { userId: { in: portalIds }, deliverable: { projectId } } });
    await db.deliverable.updateMany({ where: { projectId, reviewerId: { in: portalIds } }, data: { reviewerId: null } });
  }
  // Chat: el canal del proyecto pierde a los GUEST retirados, y las cuentas de AMBOS
  // clientes recalculan su membresía (el equipo del proyecto cambió de cuenta).
  await ensureProjectChannels(projectId).catch(() => null);
  await getOrCreateClientChannel(oldClientId).catch(() => null);
  await getOrCreateClientChannel(targetClientId).catch(() => null);

  await logActivity({
    action: "project.move_client",
    summary: `movió el proyecto «${project.name}» del cliente «${project.client.name}» a «${target.name}»`,
    projectId,
    entityType: "project",
    entityId: projectId,
  });
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${oldClientId}`);
  revalidatePath(`/clientes/${targetClientId}`);
  revalidatePath("/proyectos");
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/timeline");
  revalidatePath("/", "layout"); // sidebar: el proyecto cambia de grupo de cliente
  return { ok: true };
}

export async function updateProjectDetails(projectId: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await ensureProjectAccess(projectId, "editar_proyectos");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "El nombre no puede quedar vacío." };

  const prev = await db.project.findUnique({ where: { id: projectId }, select: { name: true, dueDate: true } });

  // Solo se actualiza lo que el formulario realmente envía (campos que el usuario tocó). Así,
  // editar el nombre no reescribe la fecha de entrega (que por zona horaria podría correrse un día).
  const data: { name: string; description?: string | null; dueDate?: Date | null } = { name };
  if (formData.has("description")) data.description = String(formData.get("description") ?? "").trim() || null;
  let nextKey: string | null = prev?.dueDate ? dayKey(prev.dueDate) : null;
  if (formData.has("dueDate")) {
    const dRaw = String(formData.get("dueDate") ?? "").trim();
    data.dueDate = dRaw ? noonUTC(dRaw) : null;
    nextKey = data.dueDate ? dayKey(data.dueDate) : null;
  }
  await db.project.update({ where: { id: projectId }, data });

  // Resumen legible para la bitácora (qué cambió): renombre y/o reprogramación de entrega.
  const parts: string[] = [];
  if (prev && prev.name !== name) parts.push(`renombró «${prev.name}» → «${name}»`);
  const prevKey = prev?.dueDate ? dayKey(prev.dueDate) : null;
  if (formData.has("dueDate") && prevKey !== nextKey) parts.push(nextKey ? `fijó la entrega el ${nextKey}` : "quitó la fecha de entrega");
  const summary = parts.length ? `actualizó el proyecto: ${parts.join(" · ")}` : `editó los datos del proyecto «${name}»`;

  await logActivity({ action: "project.details", summary, projectId, entityType: "project", entityId: projectId });
  // Si cambió la fecha de entrega, avisa al CLIENTE (portal) del proyecto.
  if (formData.has("dueDate") && prevKey !== nextKey) {
    await notifyProjectClients(projectId, {
      type: "task",
      event: "client_project_date",
      title: `Nueva fecha en «${name}»`,
      body: nextKey ? `La entrega del proyecto «${name}» se fijó para el ${nextKey}.` : `Se quitó la fecha de entrega del proyecto «${name}».`,
      link: `/proyectos/${projectId}`,
    });
  }
  revalidatePath("/timeline");
  revalidatePath("/proyectos");
  refresh(projectId);
  return { ok: true };
}

export async function deleteTask(taskId: string, _projectId: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task, "eliminar_tareas");
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
  await ensureAccessVia(task, null);
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
  const projectId = await ensureAccessVia(task, "comentar");
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
  // También a quienes YA participaron en la tarea (comentaron antes): así la nota se comparte con
  // TODOS los involucrados, no solo con responsable/dueño (antes "a veces no se enteraban").
  const priorAuthors = await db.taskComment.findMany({ where: { taskId, authorId: { not: null } }, select: { authorId: true }, distinct: ["authorId"] });
  for (const p of priorAuthors) if (p.authorId) recipients.add(p.authorId);
  // …y a los SEGUIDORES de la tarea (se apuntaron para enterarse aunque no sean responsable/dueño).
  const watchers = await db.taskWatcher.findMany({ where: { taskId }, select: { userId: true } });
  for (const w of watchers) recipients.add(w.userId);
  recipients.delete(session?.id ?? "");
  for (const userId of recipients) {
    await notify(userId, { type: "task", event: "task_comment", title: `Comentario en «${task!.title}»`, body: body.slice(0, 140), link, actorId: session?.id });
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
  if (!session) noAutorizado();
  const c = await db.taskComment.findUnique({ where: { id: commentId }, select: { authorId: true, task: { select: { projectId: true } } } });
  if (!c) return;
  if (!(session.role === "admin" || c.authorId === session.id)) noAutorizado();
  await db.taskComment.delete({ where: { id: commentId } });
  refresh(c.task.projectId);
}

// ── Etiquetas de tarea ── (clasificación libre por tarea; color = tono de la paleta)
export async function addTaskTag(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  const label = String(formData.get("label") ?? "").trim().slice(0, 40);
  const rawColor = String(formData.get("color") ?? "").trim();
  const color = TONE_MAP[rawColor] ? rawColor : "slate";
  if (!label) return;
  await db.taskTag.create({ data: { taskId, label, color } });
  refresh(projectId);
}
export async function removeTaskTag(tagId: string, _projectId: string) {
  const tag = await db.taskTag.findUnique({ where: { id: tagId }, select: { task: { select: taskAccessSelect } } });
  if (!tag) return;
  const projectId = await ensureAccessVia(tag.task);
  await db.taskTag.delete({ where: { id: tagId } });
  refresh(projectId);
}

// ── Enlaces / referencias de tarea ── VIVEN COMO ARCHIVOS del proyecto (FileAsset, kind DRIVE/LINK)
// ligados a la tarea (taskId): así el mismo enlace aparece en «Archivos» con el chip de su tarea y el
// cliente invitado lo ve. El `label` se guarda como el nombre del archivo.
export type TaskLinkItem = { id: string; url: string | null; label: string | null; kind: string };
export async function getTaskLinks(taskId: string): Promise<TaskLinkItem[]> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  await ensureAccessVia(task, null);
  const rows = await db.fileAsset.findMany({ where: { taskId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, url: true, kind: true } });
  return rows.map((f) => ({ id: f.id, url: f.url, label: f.name, kind: f.kind }));
}
export async function addTaskLink(taskId: string, _projectId: string, formData: FormData): Promise<TaskLinkItem | null> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  // Crear un archivo del proyecto = subir_archivos (con bypass del dueño/asignado de la tarea).
  const projectId = await ensureAccessVia(task, "subir_archivos");
  if (!projectId) return null; // las tareas personales (sin proyecto) no tienen sección de Archivos
  const session = await getSession();
  const url = safeExternalUrl(String(formData.get("url") ?? ""));
  if (!url) return null;
  const name = String(formData.get("label") ?? "").trim().slice(0, 160) || url;
  const kind = url.includes("drive.google.com") ? "DRIVE" : "LINK";
  const f = await db.fileAsset.create({ data: { projectId, taskId, name, url, kind, uploadedById: session?.id } });
  await logActivity({ action: "file.link", summary: `añadió el enlace «${name}» a una tarea`, projectId, entityType: "file", entityId: f.id });
  refresh(projectId);
  return { id: f.id, url: f.url, label: f.name, kind: f.kind };
}
export async function removeTaskLink(linkId: string, _projectId: string) {
  // Solo opera sobre archivos que estén LIGADOS a una tarea (no archivos sueltos del proyecto).
  const f = await db.fileAsset.findUnique({ where: { id: linkId }, select: { taskId: true, kind: true, task: { select: taskAccessSelect } } });
  if (!f?.task) return;
  const projectId = await ensureAccessVia(f.task);
  if (f.kind === "LOCAL") {
    // Archivo SUBIDO: quitarlo de la tarea solo lo DESLIGA — el archivo queda en Archivos del
    // proyecto (un guion puede servir para otra pieza). Borrarlo del todo se hace desde Archivos.
    await db.fileAsset.update({ where: { id: linkId }, data: { taskId: null } });
  } else {
    // Enlace (LINK/DRIVE): es solo una referencia añadida desde la tarea → se borra.
    await db.fileAsset.delete({ where: { id: linkId } });
  }
  refresh(projectId);
}

// Sube ARCHIVOS locales ligados a una tarea (el guion, una referencia…): quedan en «Archivos»
// del proyecto con el chip de su tarea, y SOBREVIVEN a la tarea — completarla no los toca y al
// borrarla el vínculo se suelta (FK SetNull) pero el archivo permanece en el proyecto.
export async function addTaskFiles(taskId: string, _projectId: string, formData: FormData): Promise<TaskLinkItem[]> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  // Mismo gate que subir al proyecto (con bypass del dueño/asignado de la tarea, como los enlaces).
  const projectId = await ensureAccessVia(task, "subir_archivos");
  if (!projectId) return []; // las tareas personales (sin proyecto) no tienen sección de Archivos
  const session = await getSession();
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX_UPLOAD && !BLOCKED_EXT.test(f.name));
  const saved: TaskLinkItem[] = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const asset = await db.fileAsset.create({
      data: {
        projectId,
        taskId,
        name: file.name,
        kind: "LOCAL",
        path: "",
        mime: mimeFor(file.name, file.type),
        size: buf.length,
        uploadedById: session?.id ?? null,
      },
    });
    const rel = await saveBufferWithPreview(`project/${projectId}`, `${asset.id}-${file.name}`, buf, file.type);
    await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
    await logActivity({ action: "file.upload", summary: `subió el archivo «${file.name}» a la tarea «${task!.title}»`, projectId, entityType: "file", entityId: asset.id });
    saved.push({ id: asset.id, url: null, label: file.name, kind: "LOCAL" });
  }
  if (saved.length) refresh(projectId);
  return saved;
}

// ── Seguidores de tarea ── (reciben los avisos aunque no sean responsable/dueño)
export type TaskWatcherItem = { id: string; name: string; initials: string | null; color: string | null };
export async function getTaskWatchers(taskId: string): Promise<TaskWatcherItem[]> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  await ensureAccessVia(task, null);
  const rows = await db.taskWatcher.findMany({ where: { taskId }, include: { user: { select: { id: true, name: true, initials: true, avatarColor: true } } }, orderBy: { createdAt: "asc" } });
  return rows.map((w) => ({ id: w.user.id, name: w.user.name, initials: w.user.initials, color: w.user.avatarColor }));
}
export async function addTaskWatcher(taskId: string, _projectId: string, userId: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  if (userId) await db.taskWatcher.upsert({ where: { taskId_userId: { taskId, userId } }, create: { taskId, userId }, update: {} });
  refresh(projectId);
}
export async function removeTaskWatcher(taskId: string, _projectId: string, userId: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  await db.taskWatcher.deleteMany({ where: { taskId, userId } });
  refresh(projectId);
}

// ── Entregables ──
// Valida que un usuario sea miembro del proyecto (o su responsable) para poder ser
// "responsable de la revisión". Devuelve el id válido o null.
async function validateProjectMember(projectId: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const proj = await db.project.findUnique({ where: { id: projectId }, select: { leadId: true, members: { select: { userId: true } } } });
  const allowed = new Set([proj?.leadId, ...(proj?.members.map((m) => m.userId) ?? [])].filter(Boolean) as string[]);
  if (!allowed.has(userId)) return null;
  // Un usuario del PORTAL CLIENTE (miembro invitado) SÍ puede ser el responsable de la
  // revisión: en ese caso el flujo es DIRECTO — las versiones no pasan por la compuerta
  // interna, van derecho a su portal y él aprueba/pide cambios desde ahí (trabaja mano a
  // mano con el editor). La decisión interna (/revisiones) sigue vetada para clientes.
  return userId;
}

// ¿El usuario es del portal cliente? Define el flujo DIRECTO de revisión (sin compuerta interna).
async function memberIsClient(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const u = await db.user.findUnique({ where: { id: userId }, select: { role: { select: { key: true } } } });
  return u?.role?.key === "cliente";
}

export async function createDeliverable(projectId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const type = String(formData.get("type") ?? "REEL");
  // Caducidad opcional del enlace del cliente (si no se indica, no caduca).
  const expRaw = String(formData.get("reviewExpiresAt") ?? "").trim();
  const reviewExpiresAt = expRaw ? new Date(`${expRaw}T23:59:59.000Z`) : null;
  // Límite de PRE-APROBACIÓN interna (fecha + hora de Bogotá): plazo para que el equipo
  // revise. Al vencer, el barrido de SLA cierra las tareas «Pre-aprobar…» (quien no
  // revisó queda con incumplimiento).
  const irdRaw = String(formData.get("internalReviewDate") ?? "").trim();
  const irtRaw = String(formData.get("internalReviewTime") ?? "").trim();
  const internalReviewDueAt = /^\d{4}-\d{2}-\d{2}$/.test(irdRaw)
    ? new Date(`${irdRaw}T${/^\d{1,2}:\d{2}$/.test(irtRaw) ? irtRaw.padStart(5, "0") : "18:00"}:00.000-05:00`)
    : null;
  // Responsable de la revisión: solo se acepta si es miembro/responsable del proyecto.
  const reviewerId = await validateProjectMember(projectId, String(formData.get("reviewerId") ?? "").trim() || null);

  // Archivo GRANDE ya subido por TROZOS: el formulario manda la referencia (chunkUploadId),
  // no los bytes — la action no materializa nada en RAM. Se reclama ANTES de crear nada:
  // si la subida llegó mal, no queda un entregable a medias y se puede reintentar completo.
  const chunkUploadId = String(formData.get("chunkUploadId") ?? "").trim();
  let chunkAssetId: string | null = null;
  if (chunkUploadId) {
    try {
      chunkAssetId = await claimChunkUpload({ uploadId: chunkUploadId, crc32: String(formData.get("chunkCrc32") ?? "") || null, projectId, userId: session.id });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "No se pudo verificar el archivo subido." };
    }
  }

  // Consecutivo POR PROYECTO (#1, #2…): identifica la pieza para siempre (también en la pestaña
  // «Aprobados»). A prueba de CARRERA: se toma un advisory-lock por proyecto DENTRO de la transacción
  // y se crea el entregable SIN soltarlo, así el max()+create quedan serializados (antes ambos iban
  // por separado: dos creaciones simultáneas leían el mismo max y creaban el MISMO #N). El lock se
  // libera al hacer commit.
  const d = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`deliv:${projectId}`}, 0))`;
    const top = await tx.deliverable.aggregate({ where: { projectId }, _max: { number: true } });
    const number = (top._max.number ?? 0) + 1;
    return tx.deliverable.create({ data: { projectId, name, number, type: isDeliverableType(type) ? type : "REEL", reviewExpiresAt, internalReviewDueAt, reviewerId, ownerId: session.id } });
  });
  // El conjunto de co-revisores refleja el revisor primario al crear (luego se pueden añadir más).
  if (reviewerId) await db.deliverableReviewer.create({ data: { deliverableId: d.id, userId: reviewerId } });
  await logActivity({ action: "deliverable.create", summary: `creó el entregable «${name}» (#${d.number})`, projectId, entityType: "deliverable", entityId: d.id });

  // Tareas "ítem de entregable" elegidas en el desplegable: quedan VINCULADAS a esta pieza
  // y se completan solas cuando el editor manda la versión a pre-aprobación. Solo tareas
  // del MISMO proyecto marcadas como ítem de entregable y aún abiertas.
  const workTaskIds = formData.getAll("workTaskIds").map(String).filter(Boolean);
  if (workTaskIds.length) {
    await db.task.updateMany({
      where: { id: { in: workTaskIds }, projectId, isDeliverableWork: true, completedAt: null },
      data: { deliverableId: d.id },
    });
  }

  // Primera versión opcional en el mismo formulario (link externo, archivo subido en la
  // action o archivo grande ya reclamado de la subida por trozos).
  const fileUrl = safeExternalUrl(String(formData.get("fileUrl") ?? ""));
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0 && file.size <= MAX_UPLOAD && !BLOCKED_EXT.test(file.name);
  if (fileUrl || hasFile || chunkAssetId) {
    let fileAssetId: string | null = chunkAssetId;
    if (!fileAssetId && hasFile) {
      const f = file as File;
      const buf = Buffer.from(await f.arrayBuffer());
      const asset = await db.fileAsset.create({ data: { projectId, name: f.name, kind: "LOCAL", path: "", mime: mimeFor(f.name, f.type), size: buf.length, uploadedById: session.id } });
      const rel = await saveBufferWithPreview(`project/${projectId}`, `${asset.id}-${f.name}`, buf, f.type);
      await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
      fileAssetId = asset.id;
    }
    // Revisor CLIENTE (miembro invitado) = revisión DIRECTA: la v1 no pasa por la compuerta
    // interna; queda aprobada de una y va derecho al portal del cliente.
    const directToClient = await memberIsClient(reviewerId);
    await db.deliverableVersion.create({ data: { deliverableId: d.id, number: 1, notes: null, fileUrl, fileAssetId, durationSec: parseDurationSec(formData), uploadedById: session.id, internalApproved: directToClient, internalApprovedAt: directToClient ? new Date() : null } });
    await db.deliverable.update({ where: { id: d.id }, data: { status: directToClient ? "ENVIADO_CLIENTE" : "REVISION_INTERNA" } });
    // Mandar la pieza a revisión ES terminar el trabajo: las tareas "ítem de entregable"
    // vinculadas se completan solas para el editor.
    await completeLinkedWorkTasks(d.id);
    await logActivity({ action: "deliverable.version", summary: directToClient ? `subió la v1 de «${name}» (enviada DIRECTO al cliente para revisión)` : `subió la v1 de «${name}» (pendiente de pre-aprobación interna)`, projectId, entityType: "deliverable", entityId: d.id });
    const lead = await db.project.findUnique({ where: { id: projectId }, select: { leadId: true, name: true } });
    if (directToClient && reviewerId) {
      // Directo al portal del cliente: notificación con SU enlace (no /revisiones, que no puede abrir).
      await notifyAndEmail(reviewerId, { type: "review", event: "client_deliverable_ready", title: `Tu entregable está listo: ${name}`, body: `El equipo subió «${name}» en «${lead?.name ?? ""}». Ya puedes verlo, comentarlo y aprobarlo.`, link: `/mis-entregas/${projectId}`, actorId: session.id });
    } else {
      // Solo al RESPONSABLE de la revisión: el reviewer asignado; si no hay, el lead del proyecto.
      const responsible = reviewerId ?? lead?.leadId ?? null;
      if (responsible && responsible !== session.id) {
        await notifyAndEmail(responsible, { type: "review", event: "review_pending", title: `Revisión pendiente: ${name}`, body: `${session.name} subió la v1 en «${lead?.name ?? ""}». Revísala y pre-apruébala o solicita cambios.`, link: `/revisiones/${d.id}`, actorId: session.id });
      }
      // Tarea REAL en el tablero (fase Postproducción) para el responsable de la revisión,
      // con el límite de pre-aprobación (o la caducidad del enlace) como fecha límite: la
      // pre-aprobación no queda solo en una notificación.
      await createDeliverableAutoTask({
        projectId,
        deliverableId: d.id,
        title: autoTaskTitles.review(name, 1),
        description: `Revisa la v1 y pre-apruébala o solicita cambios en /revisiones. Al decidir, esta tarea se completa sola.`,
        assigneeId: responsible,
        dueAt: internalReviewDueAt ?? reviewExpiresAt,
        actorId: session.id,
      });
    }
  }

  // Portada: la imagen adjunta en el formulario; si no hay, el fotograma capturado del video.
  const cover = formData.get("cover");
  if (cover instanceof File && cover.size > 0) {
    await saveDeliverableCover({ projectId, deliverableId: d.id, deliverableName: name, prevCoverId: null, file: cover, uploadedById: session.id });
  } else {
    const posterFile = posterDataUrlToFile(String(formData.get("poster") ?? ""));
    if (posterFile) {
      await saveDeliverableCover({ projectId, deliverableId: d.id, deliverableName: name, prevCoverId: null, file: posterFile, uploadedById: session.id }).catch(() => {});
    }
  }
  refresh(projectId);
}

// Asigna/cambia el responsable de la revisión (solo miembros del proyecto).
// Asigna el CONJUNTO de revisores (co-revisores) que pueden pre-aprobar/solicitar cambios en el
// entregable. Reemplaza los anteriores. Mantiene reviewerId = primero del conjunto (compat/visual).
// Solo gestores del proyecto. Notifica a los revisores recién añadidos.
export async function setDeliverableReviewers(deliverableId: string, _projectId: string, userIds: string[]) {
  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { name: true, projectId: true, project: { select: accessSelect }, reviewers: { select: { userId: true } } },
  });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) noAutorizado();
  // Revisores: cualquier persona del equipo INTERNO (si no era miembro del proyecto, se
  // agrega automáticamente — necesita acceso a lo que va a revisar). Los usuarios del portal
  // CLIENTE solo si ya son miembros de este proyecto (no se invitan clientes ajenos).
  const valid: string[] = [];
  for (const uid of [...new Set(userIds)]) {
    const u = await db.user.findUnique({ where: { id: uid }, select: { id: true, active: true, isSystemBot: true, role: { select: { key: true } } } });
    if (!u || !u.active || u.isSystemBot) continue;
    if (u.role.key === "cliente") {
      const ok = await validateProjectMember(deliverable.projectId, uid);
      if (!ok) continue;
    } else {
      await db.projectMember.upsert({
        where: { projectId_userId: { projectId: deliverable.projectId, userId: uid } },
        create: { projectId: deliverable.projectId, userId: uid },
        update: {},
      });
    }
    if (!valid.includes(uid)) valid.push(uid);
  }
  const before = new Set(deliverable.reviewers.map((r) => r.userId));
  // Reemplaza el conjunto: quita los que ya no están, agrega los nuevos.
  await db.deliverableReviewer.deleteMany({ where: { deliverableId, userId: { notIn: valid.length ? valid : ["__none__"] } } });
  if (valid.length) await db.deliverableReviewer.createMany({ data: valid.map((userId) => ({ deliverableId, userId })), skipDuplicates: true });
  // reviewerId primario = primero del conjunto (compatibilidad y visualización).
  await db.deliverable.update({ where: { id: deliverableId }, data: { reviewerId: valid[0] ?? null } });
  // Roles de TODO el conjunto (no solo los recién añadidos): definen si el entregable queda como
  // revisión DIRECTA del cliente (todos los revisores son del portal cliente).
  const validUsers = valid.length
    ? await db.user.findMany({ where: { id: { in: valid } }, select: { id: true, role: { select: { key: true } } } })
    : [];
  const clientReviewers = validUsers.filter((u) => u.role?.key === "cliente").map((u) => u.id);
  const allClients = valid.length > 0 && clientReviewers.length === valid.length;

  // Si el conjunto quedó como revisión DIRECTA de cliente y había una versión ATRAPADA en la
  // compuerta interna (subida ANTES de taguear al cliente), se LIBERA ahora para que llegue a su
  // portal. Sin este paso, taguear al cliente después de subir el video dejaba la pieza en
  // REVISION_INTERNA y el cliente nunca la recibía. (Sin versiones o ya enviada al cliente: no-op.)
  let releasedNow = false;
  if (allClients) {
    const cur = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { status: true } });
    if (cur && (cur.status === "REVISION_INTERNA" || cur.status === "PENDIENTE")) {
      const latest = await db.deliverableVersion.findFirst({
        where: { deliverableId },
        orderBy: { number: "desc" },
        select: { id: true, number: true, internalApproved: true },
      });
      if (latest && !latest.internalApproved) {
        await db.deliverableVersion.update({ where: { id: latest.id }, data: { internalApproved: true, internalApprovedAt: new Date() } });
        await db.deliverable.update({ where: { id: deliverableId }, data: { status: "ENVIADO_CLIENTE" } });
        // La pre-aprobación interna ya no aplica (va directo al cliente): cierra esa tarea.
        await closeDeliverableAutoTasks(deliverableId, ["review"]);
        await logActivity({ action: "deliverable.version", summary: `liberó la v${latest.number} de «${deliverable.name}» directo al cliente (revisión directa)`, projectId: deliverable.projectId, entityType: "deliverable", entityId: deliverableId });
        releasedNow = true;
      }
    }
  }

  const added = valid.filter((id) => !before.has(id) && id !== session!.id);
  const teamAdded = added.filter((id) => !clientReviewers.includes(id));
  // Revisores de EQUIPO recién añadidos → su bandeja interna (/revisiones).
  if (teamAdded.length) {
    await notifyManyAndEmail(teamAdded, {
      type: "review",
      event: "review_reviewer",
      title: `Eres revisor de: ${deliverable.name}`,
      body: "Te asignaron como revisor: puedes pre-aprobar o solicitar cambios en este entregable.",
      link: `/revisiones/${deliverableId}`,
      actorId: session?.id,
    });
  }
  // Revisores CLIENTE → SU portal (/mis-entregas). Se avisa a los recién añadidos y, si acabamos de
  // liberar una versión atrapada, también a los clientes que ya estaban (para que sepan que ya la
  // pueden ver). El mensaje refleja si YA hay material disponible o si aún llegará.
  const clientToNotify = new Set<string>(added.filter((id) => clientReviewers.includes(id)));
  if (releasedNow) clientReviewers.forEach((id) => { if (id !== session!.id) clientToNotify.add(id); });
  if (clientToNotify.size) {
    const st = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { status: true } });
    const hasMaterial = !!st && ["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"].includes(st.status);
    await notifyManyAndEmail([...clientToNotify], {
      type: "review",
      event: hasMaterial ? "client_deliverable_ready" : "review_reviewer",
      title: hasMaterial ? `Tienes un entregable para revisar: ${deliverable.name}` : `Revisarás directamente: ${deliverable.name}`,
      body: hasMaterial
        ? "Ya puedes verlo, comentarlo y aprobarlo desde tu portal de entregas."
        : "El equipo te enviará las versiones directo a tu portal para que las revises, comentes y apruebes.",
      link: `/mis-entregas/${deliverable.projectId}`,
      actorId: session?.id,
    });
  }
  refresh(deliverable.projectId);
}

// Compat: asignar/cambiar un ÚNICO revisor (lo delega al conjunto de co-revisores).
export async function setDeliverableReviewer(deliverableId: string, _projectId: string, reviewerId: string | null) {
  await setDeliverableReviewers(deliverableId, _projectId, reviewerId ? [reviewerId] : []);
}

// Fija o quita la caducidad del enlace del cliente (vacío = sin caducidad).
// Recibe FormData (lo dispara el <DateInput name="reviewExpiresAt">).
export async function setReviewExpiry(deliverableId: string, _projectId: string, formData: FormData) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) noAutorizado();
  const dateStr = String(formData.get("reviewExpiresAt") ?? "").trim();
  const exp = dateStr ? new Date(`${dateStr}T23:59:59.000Z`) : null;
  await db.deliverable.update({ where: { id: deliverableId }, data: { reviewExpiresAt: exp } });
  refresh(deliverable.projectId);
}

// Fija o quita el límite de PRE-APROBACIÓN interna (fecha + hora de Bogotá). Vacío = sin
// plazo (las tareas «Pre-aprobar…» no vencen solas). Actualiza también el vencimiento de
// las tareas de revisión ABIERTAS para que el tablero refleje el nuevo plazo.
export async function setInternalReviewDue(deliverableId: string, _projectId: string, formData: FormData) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) noAutorizado();
  const dateStr = String(formData.get("internalReviewDate") ?? "").trim();
  const timeStr = String(formData.get("internalReviewTime") ?? "").trim();
  const due = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(`${dateStr}T${/^\d{1,2}:\d{2}$/.test(timeStr) ? timeStr.padStart(5, "0") : "18:00"}:00.000-05:00`)
    : null;
  await db.deliverable.update({ where: { id: deliverableId }, data: { internalReviewDueAt: due } });
  const { dueDate, dueTime } = taskDueFromInstant(due);
  await db.task.updateMany({
    where: { deliverableId, completedAt: null, title: { startsWith: "Pre-aprobar" } },
    data: { dueDate, dueTime },
  });
  refresh(deliverable.projectId);
}

// Borra el entregable COMPLETO (versiones, comentarios, decisiones; las tareas se
// desvinculan). Solo el responsable del proyecto o un admin.
export async function deleteDeliverable(deliverableId: string, _projectId: string) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) noAutorizado();
  await db.deliverable.delete({ where: { id: deliverableId } });
  await logActivity({ action: "deliverable.delete", summary: `eliminó el entregable «${deliverable.name}»`, projectId: deliverable.projectId, entityType: "deliverable" });
  refresh(deliverable.projectId);
}

// ── Fotos de entregables (type = FOTOGRAFIA): galería de selección del cliente ──
// Añade fotos a un entregable: archivos subidos al NAS (con miniatura) y/o enlaces de
// Drive/imagen (una URL por línea). Cada foto queda PENDIENTE hasta que el cliente la marca.
export async function addDeliverablePhotos(projectId: string, deliverableId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId, "subir_archivos");
  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { name: true, projectId: true, project: { select: accessSelect } },
  });
  if (!deliverable || deliverable.projectId !== projectId) noAutorizado();
  if (!canWriteProject(deliverable.project, session)) noAutorizado();

  // La posición continúa después de la última foto existente.
  const last = await db.deliverablePhoto.findFirst({ where: { deliverableId }, orderBy: { position: "desc" }, select: { position: true } });
  let pos = (last?.position ?? -1) + 1;
  let added = 0;

  // 1) Archivos subidos → NAS (solo imágenes; se genera miniatura WebP).
  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX_UPLOAD && !BLOCKED_EXT.test(f.name) && isOptimizableImage(f.name, f.type));
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const asset = await db.fileAsset.create({ data: { projectId, name: f.name, kind: "LOCAL", path: "", mime: mimeFor(f.name, f.type), size: buf.length, uploadedById: session.id } });
    const rel = await saveBufferWithPreview(`project/${projectId}/fotos`, `${asset.id}-${f.name}`, buf, f.type);
    await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
    await db.deliverablePhoto.create({ data: { deliverableId, fileAssetId: asset.id, filename: f.name, position: pos++ } });
    added++;
  }

  // 2) Enlaces de Drive / imagen (una URL por línea).
  const links = String(formData.get("photoLinks") ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const link of links) {
    const safe = safeExternalUrl(link);
    if (!safe) continue;
    const guessed = (() => { try { return decodeURIComponent(new URL(safe).pathname.split("/").filter(Boolean).pop() || ""); } catch { return ""; } })();
    await db.deliverablePhoto.create({ data: { deliverableId, url: safe, filename: guessed || "Foto enlazada", position: pos++ } });
    added++;
  }

  if (added > 0) {
    await logActivity({ action: "deliverable.photos", summary: `añadió ${added} foto(s) al entregable «${deliverable.name}»`, projectId, entityType: "deliverable", entityId: deliverableId });
  }
  refresh(projectId);
}

// Borra una foto del entregable (y su FileAsset si era local). Solo gestores del proyecto.
export async function deleteDeliverablePhoto(photoId: string, projectId: string) {
  const photo = await db.deliverablePhoto.findUnique({
    where: { id: photoId },
    select: { fileAssetId: true, deliverable: { select: { projectId: true, project: { select: accessSelect } } } },
  });
  if (!photo || photo.deliverable.projectId !== projectId) noAutorizado();
  const session = await getSession();
  if (!canManageProject(photo.deliverable.project, session)) noAutorizado();
  await db.deliverablePhoto.delete({ where: { id: photoId } });
  // El registro de la foto no cascada al FileAsset (es al revés); lo borramos aquí si era local.
  if (photo.fileAssetId) await db.fileAsset.delete({ where: { id: photo.fileAssetId } }).catch(() => {});
  refresh(projectId);
}

// "durationSec" del formulario (segundos, entero positivo acotado) o null.
function parseDurationSec(formData: FormData): number | null {
  const raw = String(formData.get("durationSec") ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 && n <= 360000 ? n : null; // hasta 100 h
}

// data URL de imagen (poster capturado en el cliente al subir) → File para saveDeliverableCover, o null.
function posterDataUrlToFile(raw: string): File | null {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(raw.trim());
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length === 0 || buf.length > 400_000) return null;
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  return new File([buf], `poster.${ext}`, { type: `image/${m[1]}` });
}

// Lógica compartida de guardado de la PORTADA (validación + WebP en el NAS + coverFileAssetId).
// La usan setDeliverableCover y los formularios de subida (createDeliverable / addDeliverableVersion)
// que adjuntan la portada opcionalmente. La autorización la hace cada acción ANTES de llamar aquí.
async function saveDeliverableCover(opts: {
  projectId: string;
  deliverableId: string;
  deliverableName: string;
  prevCoverId: string | null; // portada anterior a reemplazar (se borra para no dejar huérfanos)
  file: File;
  uploadedById: string;
}): Promise<void> {
  const { projectId, deliverableId, deliverableName, prevCoverId, file, uploadedById } = opts;
  if (file.size > MAX_UPLOAD || BLOCKED_EXT.test(file.name) || !isOptimizableImage(file.name, file.type)) {
    throw new Error("La portada debe ser una imagen (JPG, PNG o WebP).");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const asset = await db.fileAsset.create({ data: { projectId, name: file.name, kind: "LOCAL", path: "", mime: mimeFor(file.name, file.type), size: buf.length, uploadedById } });
  const rel = await saveBufferWithPreview(`project/${projectId}/portadas`, `${asset.id}-${file.name}`, buf, file.type);
  await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });

  await db.deliverable.update({ where: { id: deliverableId }, data: { coverFileAssetId: asset.id } });
  // Borra la portada anterior para no dejar archivos huérfanos.
  if (prevCoverId) await db.fileAsset.delete({ where: { id: prevCoverId } }).catch(() => {});

  await logActivity({ action: "deliverable.cover", summary: `actualizó la portada del entregable «${deliverableName}»`, projectId, entityType: "deliverable", entityId: deliverableId });
}

// Sube/reemplaza la PORTADA del entregable (la imagen que acompaña al reel/video). Imagen
// optimizada a WebP en el NAS; se sirve por /api/files-asset. Solo gestores con subir_archivos.
export async function setDeliverableCover(projectId: string, deliverableId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId, "subir_archivos");
  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { name: true, projectId: true, coverFileAssetId: true, project: { select: accessSelect } },
  });
  if (!deliverable || deliverable.projectId !== projectId) noAutorizado();
  if (!canWriteProject(deliverable.project, session)) noAutorizado();

  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) throw new Error("Sube una imagen para la portada.");
  await saveDeliverableCover({ projectId, deliverableId, deliverableName: deliverable.name, prevCoverId: deliverable.coverFileAssetId, file, uploadedById: session.id });
  refresh(projectId);
}

// Quita la portada del entregable. Solo gestores del proyecto.
export async function removeDeliverableCover(projectId: string, deliverableId: string) {
  const session = await getSession();
  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { projectId: true, coverFileAssetId: true, project: { select: accessSelect } },
  });
  if (!deliverable || deliverable.projectId !== projectId) noAutorizado();
  if (!canManageProject(deliverable.project, session)) noAutorizado();
  const prevId = deliverable.coverFileAssetId;
  await db.deliverable.update({ where: { id: deliverableId }, data: { coverFileAssetId: null } });
  if (prevId) await db.fileAsset.delete({ where: { id: prevId } }).catch(() => {});
  refresh(projectId);
}

export async function setDeliverableStatus(id: string, _projectId: string, status: string) {
  // Se valida la entrada (enum DeliverableStatus) para no permitir saltos directos a
  // APROBADO/ENTREGADO con strings arbitrarios; el guard además estrecha el tipo.
  if (!isDeliverableStatus(status)) throw new Error("Estado inválido");
  const deliverable = await db.deliverable.findUnique({ where: { id }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(deliverable, null);
  // Invariante: el sello de publicado solo vive sobre algo aprobado/entregado. Si se mueve el estado
  // a cualquier otro (p. ej. de vuelta a CORRECCIONES a mano), se quita el sello para que no quede
  // atascado en «Publicados» siendo en realidad algo en revisión.
  const clearPublished = status !== "APROBADO" && status !== "ENTREGADO";
  await db.deliverable.update({ where: { id }, data: clearPublished ? { status, publishedAt: null, publishedById: null } : { status } });
  await logActivity({ action: "deliverable.status", summary: `cambió el estado del entregable «${deliverable!.name}» a ${deliverableStatusMeta(status).label}`, projectId, entityType: "deliverable", entityId: id });
  refresh(projectId);
}

// Marca (o quita) el sello de PUBLICADO de un entregable. "Publicado" es un HECHO con fecha y autor,
// SEPARADO del estado de aprobación (ver el campo publishedAt en el schema): por eso vive aparte y no
// como un estado más del enum. Solo lo pueden marcar los PRODUCTORES —gestionan el proyecto Y tienen
// `aprobar_entregables` (admin y gerente incluidos)—, el mismo gate que la pre-aprobación interna del
// gestor. Solo tiene sentido sobre algo YA aprobado por el cliente: publicar algo aún en revisión o
// con cambios se saltaría el flujo. El cliente nunca ve este sello (es control interno del equipo).
export async function setDeliverablePublished(deliverableId: string, _projectId: string, published: boolean) {
  const session = await getSession();
  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { name: true, projectId: true, status: true, publishedAt: true, project: { select: accessSelect } },
  });
  if (!deliverable) noAutorizado();
  if (!(canManageProject(deliverable.project, session) && hasPermission(session, "aprobar_entregables"))) noAutorizado();
  if (published) {
    // Publicar exige que el CLIENTE ya lo haya aprobado (APROBADO) o esté entregado: no se marca
    // "al aire" algo que sigue en revisión interna, con el cliente o con cambios.
    if (deliverable.status !== "APROBADO" && deliverable.status !== "ENTREGADO") {
      throw new Error("Solo se puede marcar como publicado un entregable aprobado por el cliente.");
    }
    // Idempotente: si ya estaba publicado, se conserva la fecha y el autor originales.
    if (!deliverable.publishedAt) {
      await db.deliverable.update({ where: { id: deliverableId }, data: { publishedAt: new Date(), publishedById: session!.id } });
      await logActivity({ action: "deliverable.published", summary: `marcó como publicado el entregable «${deliverable.name}»`, projectId: deliverable.projectId, entityType: "deliverable", entityId: deliverableId });
    }
  } else if (deliverable.publishedAt) {
    // Solo si estaba publicado: evita un update no-op y una entrada de auditoría espuria al
    // llamar "despublicar" sobre algo que ya no lo estaba (idempotente, como la rama de publicar).
    await db.deliverable.update({ where: { id: deliverableId }, data: { publishedAt: null, publishedById: null } });
    await logActivity({ action: "deliverable.unpublished", summary: `quitó el sello de publicado del entregable «${deliverable.name}»`, projectId: deliverable.projectId, entityType: "deliverable", entityId: deliverableId });
  }
  refresh(deliverable.projectId);
}

// Formato/tipo de un entregable: EDITABLE después de publicarlo (p. ej. cambiar de vertical a
// horizontal). El tipo define la orientación de la revisión (ver deliverableOrientation). Se
// valida contra el enum. Mismo alcance de acceso que cambiar el estado.
export async function setDeliverableType(id: string, _projectId: string, type: string) {
  if (!isDeliverableType(type)) throw new Error("Tipo inválido");
  const deliverable = await db.deliverable.findUnique({ where: { id }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(deliverable, null);
  await db.deliverable.update({ where: { id }, data: { type } });
  await logActivity({ action: "deliverable.type", summary: `cambió el formato del entregable «${deliverable!.name}» a ${DELIVERABLE_TYPE[type] ?? type}`, projectId, entityType: "deliverable", entityId: id });
  refresh(projectId);
}

export async function addDeliverableVersion(
  deliverableId: string,
  _projectId: string,
  formData: FormData,
) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, ownerId: true, reviewerId: true, coverFileAssetId: true, reviewExpiresAt: true, internalReviewDueAt: true, fixDueAt: true, reviewers: { select: { userId: true, user: { select: { role: { select: { key: true } } } } } }, project: { select: { ...accessSelect, name: true } } } });
  const session = await getSession();
  // Escritura (no solo lectura): un invitado GUEST no puede subir versiones. Subir una versión
  // es subir un archivo → exige subir_archivos (salvo el dueño del entregable).
  if (!deliverable || !canWriteProject(deliverable.project, session)) noAutorizado();
  if (!hasPermission(session, "subir_archivos") && deliverable.ownerId !== session!.id) noAutorizado();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  // Nuevo límite de pre-aprobación para ESTA versión (opcional): si el formulario lo trae,
  // reemplaza el anterior; si no, se conserva el del entregable.
  const irdRaw = String(formData.get("internalReviewDate") ?? "").trim();
  const irtRaw = String(formData.get("internalReviewTime") ?? "").trim();
  const newInternalDue = /^\d{4}-\d{2}-\d{2}$/.test(irdRaw)
    ? new Date(`${irdRaw}T${/^\d{1,2}:\d{2}$/.test(irtRaw) ? irtRaw.padStart(5, "0") : "18:00"}:00.000-05:00`)
    : null;
  // Si NO se indica una fecha nueva, se hereda la del entregable SOLO si sigue VIGENTE: un plazo
  // interno YA VENCIDO no debe pasar a la nueva versión — la tarea «Pre-aprobar vN» nacería ya
  // incumplida (y el barrido de SLA la marcaría al instante). Vencido → sin plazo hasta fijar uno.
  const carriedDue = deliverable.internalReviewDueAt && deliverable.internalReviewDueAt.getTime() > Date.now() ? deliverable.internalReviewDueAt : null;
  const internalDueAt = newInternalDue ?? carriedDue;
  const fileUrl = safeExternalUrl(String(formData.get("fileUrl") ?? ""));
  const last = await db.deliverableVersion.findFirst({
    where: { deliverableId },
    orderBy: { number: "desc" },
  });
  let number = (last?.number ?? 0) + 1;

  // Archivo subido (opcional): se guarda como FileAsset del proyecto y se vincula
  // a la versión, para que el portal del cliente pueda mostrarlo/reproducirlo.
  // Si el archivo era GRANDE, el formulario ya lo subió por trozos y manda solo la
  // referencia (chunkUploadId): se reclama verificado, sin pasar los bytes por la action.
  const file = formData.get("file");
  const chunkUploadId = String(formData.get("chunkUploadId") ?? "").trim();
  let fileAssetId: string | null = null;
  if (chunkUploadId) {
    try {
      fileAssetId = await claimChunkUpload({ uploadId: chunkUploadId, crc32: String(formData.get("chunkCrc32") ?? "") || null, projectId: deliverable.projectId, userId: session!.id });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "No se pudo verificar el archivo subido." };
    }
  } else if (file instanceof File && file.size > 0 && file.size <= MAX_UPLOAD && !BLOCKED_EXT.test(file.name)) {
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

  // Revisión DIRECTA: si TODOS los revisores asignados son usuarios del portal cliente
  // (miembros invitados), la versión no pasa por la compuerta interna — queda aprobada y
  // va derecho al portal del cliente, que trabaja los cambios directamente con el editor.
  const directToClient = deliverable.reviewers.length > 0 && deliverable.reviewers.every((r) => r.user.role?.key === "cliente");
  // Dos subidas simultáneas calcularían el MISMO number → P2002 por @@unique([deliverableId, number])
  // (500 + FileAsset huérfano). Se reintenta recomputando el número; si falla del todo, se limpia el
  // FileAsset recién creado para no dejar basura en disco/BD.
  for (let attempt = 0; ; attempt++) {
    try {
      await db.deliverableVersion.create({
        data: {
          deliverableId,
          number,
          notes,
          fileUrl,
          fileAssetId,
          durationSec: parseDurationSec(formData),
          uploadedById: session!.id,
          // Pendiente de pre-aprobación interna (no llega al cliente hasta aprobarla), salvo
          // en revisión directa (revisor = cliente).
          internalApproved: directToClient,
          internalApprovedAt: directToClient ? new Date() : null,
        },
      });
      break;
    } catch (e) {
      if (attempt < 4 && (e as { code?: string })?.code === "P2002") {
        const fresh = await db.deliverableVersion.findFirst({ where: { deliverableId }, orderBy: { number: "desc" }, select: { number: true } });
        number = (fresh?.number ?? 0) + 1;
        continue;
      }
      if (fileAssetId) await db.fileAsset.delete({ where: { id: fileAssetId } }).catch(() => {});
      throw e;
    }
  }
  // Auto-portada: si el entregable aún no tiene portada, usa el fotograma capturado al subir.
  if (!deliverable.coverFileAssetId) {
    const posterFile = posterDataUrlToFile(String(formData.get("poster") ?? ""));
    if (posterFile) {
      await saveDeliverableCover({ projectId: deliverable.projectId, deliverableId, deliverableName: deliverable.name, prevCoverId: null, file: posterFile, uploadedById: session!.id }).catch(() => {});
    }
  }
  // La nueva versión pasa a revisión interna (compuerta bloqueante) o directo al cliente.
  // Se guarda el nuevo límite de pre-aprobación (si vino) y se LIMPIA el plazo de corrección:
  // la corrección ya llegó (a tiempo o tarde, eso queda registrado en la tarea).
  // También se QUITA el sello de publicado: si el entregable ya estaba publicado, este corte nuevo
  // lo supera y vuelve al flujo de revisión — sin esto, se quedaría atascado en «Publicados»
  // (publishedAt no nulo) e invisible en «Por aprobar», ocultando que necesita revisarse otra vez.
  await db.deliverable.update({ where: { id: deliverableId }, data: { status: directToClient ? "ENVIADO_CLIENTE" : "REVISION_INTERNA", internalReviewDueAt: internalDueAt, fixDueAt: null, publishedAt: null, publishedById: null } });
  await logActivity({ action: "deliverable.version", summary: directToClient ? `subió la versión v${number} de «${deliverable.name}» (enviada DIRECTO al cliente para revisión)` : `subió la versión v${number} de «${deliverable.name}» (pendiente de pre-aprobación interna)`, projectId: deliverable.projectId, entityType: "deliverable", entityId: deliverableId });
  // Mandar la versión a revisión completa las tareas "ítem de entregable" vinculadas.
  await completeLinkedWorkTasks(deliverableId);
  // Esta versión ES la corrección: cierra las tareas «Corregir …» abiertas del entregable.
  // Si llegó DESPUÉS del plazo fijado (fixDueAt), la tarea se completa igual pero queda con
  // INCUMPLIMIENTO — el plazo se venció aunque la corrección haya llegado después.
  const lateFix = !!deliverable.fixDueAt && Date.now() > deliverable.fixDueAt.getTime();
  await closeDeliverableAutoTasks(deliverableId, ["fix"], { breachIfAfter: deliverable.fixDueAt ?? null });
  if (lateFix) {
    // Aviso al responsable del proyecto: la corrección llegó, pero fuera de plazo.
    const leadId = deliverable.project.leadId;
    if (leadId && leadId !== session!.id) {
      await notify(leadId, {
        type: "review",
        event: "review_sla",
        title: `Corrección fuera de plazo: ${deliverable.name}`,
        body: `${session!.name} subió la v${number}, pero el plazo de la corrección ya se había vencido. La tarea quedó con incumplimiento.`,
        link: `/revisiones/${deliverableId}`,
        actorId: session!.id,
      });
    }
  }
  // Las tareas «Pre-aprobar…» de la versión ANTERIOR que sigan abiertas quedan obsoletas.
  // Antes de cerrarlas "limpias", el barrido de SLA juzga las que ya estaban VENCIDAS
  // (quien dejó pasar su plazo sin revisar queda con incumplimiento, no con tarea cumplida).
  await sweepDeliverableSla({ force: true }).catch(() => null);
  await closeDeliverableAutoTasks(deliverableId, ["review"]);
  const reviewerIds = deliverable.reviewers.map((r) => r.userId);
  if (directToClient) {
    // Directo al portal: aviso al cliente-revisor con SU enlace (no /revisiones).
    const clientRecipients = reviewerIds.filter((id) => id !== session!.id);
    if (clientRecipients.length) {
      await notifyManyAndEmail(clientRecipients, {
        type: "review",
        event: "client_deliverable_ready",
        title: `Nueva versión lista: ${deliverable.name}`,
        body: `El equipo subió la v${number} en «${deliverable.project.name}». Ya puedes verla, comentarla y aprobarla.`,
        link: `/mis-entregas/${deliverable.projectId}`,
        actorId: session!.id,
      });
    }
  } else {
    // Aviso DIRIGIDO solo al RESPONSABLE de la revisión: el reviewer asignado; si no hay, el
    // responsable del proyecto (lead) y, en último caso, el dueño del entregable. Se excluye a
    // quien subió la versión. (Antes se avisaba a TODOS los administradores → se quitó: la
    // pre-aprobación es del responsable, no de todo el mundo.)
    const recipients = (reviewerIds.length ? reviewerIds : ([deliverable.project.leadId ?? deliverable.ownerId].filter(Boolean) as string[]))
      .filter((id) => id !== session!.id);
    if (recipients.length) {
      await notifyManyAndEmail(recipients, {
        type: "review",
        event: "review_pending",
        title: `Revisión pendiente: ${deliverable.name}`,
        body: `${session!.name} subió la v${number} en «${deliverable.project.name}». Revísala y pre-apruébala o solicita cambios.`,
        link: `/revisiones/${deliverableId}`,
        actorId: session!.id,
      });
    }
    // Tarea de pre-aprobación a CADA revisor del EQUIPO (cada quien responde por su
    // revisión), con el límite de pre-aprobación como fecha/hora de vencimiento. Si no hay
    // revisores, al responsable del proyecto o al dueño del entregable.
    const teamReviewerIds = deliverable.reviewers.filter((r) => r.user.role?.key !== "cliente").map((r) => r.userId);
    await createReviewTasksForReviewers({
      projectId: deliverable.projectId,
      deliverableId,
      title: autoTaskTitles.review(deliverable.name, number),
      description: `Revisa la v${number} y pre-apruébala o solicita cambios en /revisiones. Al decidir, esta tarea se completa sola.${internalDueAt ? " Si el plazo vence sin revisar, queda como incumplida." : ""}`,
      reviewerIds: teamReviewerIds.length ? teamReviewerIds : [deliverable.project.leadId ?? deliverable.ownerId],
      dueAt: internalDueAt ?? deliverable.reviewExpiresAt,
      actorId: session!.id,
    });
  }

  // Portada opcional adjunta en el mismo formulario (reemplaza la anterior si existía).
  const cover = formData.get("cover");
  if (cover instanceof File && cover.size > 0) {
    await saveDeliverableCover({ projectId: deliverable.projectId, deliverableId, deliverableName: deliverable.name, prevCoverId: deliverable.coverFileAssetId, file: cover, uploadedById: session!.id });
  }
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
  // Plazo de entrega de la CORRECCIÓN (ISO), fijado por el productor en la ventana
  // emergente al solicitar cambios. Si no llega, 24 horas HÁBILES (sáb/dom no cuentan).
  // El cliente nunca ve esto: es un control interno.
  fixDueIso?: string | null,
) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, ownerId: true, reviewerId: true, reviewExpiresAt: true, status: true, versions: { orderBy: { number: "desc" }, take: 1, select: { number: true } }, reviewers: { select: { userId: true } }, project: { select: { ...accessSelect, name: true } } } });
  const session = await getSession();
  // Decide el responsable del proyecto/admin O CUALQUIER revisor asignado (co-revisores).
  // El gestor del proyecto necesita además aprobar_entregables; un revisor asignado siempre puede.
  const mayDecide = !!deliverable && (
    (canManageProject(deliverable.project, session) && hasPermission(session, "aprobar_entregables")) ||
    // Co-revisores internos (NUNCA un usuario del portal cliente, aunque sea miembro GUEST).
    (session?.role !== "cliente" && (
      deliverable.reviewers.some((r) => r.userId === session?.id) ||
      (!!deliverable.reviewerId && deliverable.reviewerId === session?.id)
    ))
  );
  if (!deliverable || !mayDecide) noAutorizado();
  // Igual que la API v1: solo se decide sobre la ÚLTIMA versión y solo en REVISION_INTERNA. La UI ya
  // lo acota, pero esto blinda la invocación directa del server action (no regresar un entregable ya
  // aprobado por el cliente, ni pre-aprobar una versión vieja).
  const latestVersion = deliverable.versions[0]?.number ?? 0;
  // Estado OBSOLETO: otro co-revisor ya decidió, o el equipo subió una versión nueva mientras
  // esta pestaña seguía abierta. Antes se LANZABA y el revisor caía a la pantalla gris; ahora se
  // re-sincroniza la vista y se sale sin error — verá el estado real y podrá decidir de nuevo.
  if (versionNumber !== latestVersion || deliverable.status !== "REVISION_INTERNA") {
    revalidatePath(`/proyectos/${deliverable.projectId}`);
    revalidatePath(`/revisiones/${deliverableId}`);
    return;
  }
  const projectId = deliverable.projectId;
  const approved = result === "APROBADO";
  // Plazo de la corrección en curso (se fija más abajo si el resultado es CAMBIOS).
  let fixDueAt: Date | null = null;

  await db.deliverableDecision.create({
    data: { deliverableId, versionNumber, stage: "INTERNA", result, byUserId: session!.id, note: note?.slice(0, 1000) || null },
  });
  if (approved) {
    await db.deliverableVersion.updateMany({ where: { deliverableId, number: versionNumber }, data: { internalApproved: true, internalApprovedAt: new Date() } });
    await db.deliverable.update({ where: { id: deliverableId }, data: { status: "ENVIADO_CLIENTE" } });
    // Avisa al CLIENTE (portal): su entregable ya está listo para revisarlo y aprobarlo.
    await notifyProjectClients(projectId, {
      type: "review",
      event: "client_deliverable_ready",
      title: `Tu entregable está listo: ${deliverable.name}`,
      body: `El equipo terminó «${deliverable.name}» en «${deliverable.project.name}». Ya puedes verlo, comentarlo y aprobarlo.`,
      // A su SALA de entregas (con reproductor, portada, copy y descargas), no a la vista antigua.
      link: `/mis-entregas/${projectId}`,
      actorId: session!.id,
    });
  } else {
    // Plazo de la corrección: el que fijó el productor en la ventana emergente o, por
    // defecto, 24 horas hábiles desde ahora (si cae en fin de semana, corre al lunes).
    const parsedFixDue = fixDueIso ? new Date(fixDueIso) : null;
    fixDueAt = parsedFixDue && !isNaN(parsedFixDue.getTime()) && parsedFixDue.getTime() > Date.now()
      ? parsedFixDue
      : defaultFixDeadline(new Date());
    await db.deliverable.update({ where: { id: deliverableId }, data: { status: "CORRECCIONES", fixDueAt } });
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
  // ── Tareas del flujo ── la decisión COMPLETA la tarea «Pre-aprobar …» del revisor, y crea
  // la siguiente tarea a quien subió la versión: «Corregir …» (cambios) o «Entregar al
  // cliente …» (aprobada). Así el requisito nunca queda a medias con solo una notificación.
  const version = await db.deliverableVersion.findFirst({ where: { deliverableId, number: versionNumber }, select: { uploadedById: true } });
  const uploaderId = version?.uploadedById ?? deliverable.ownerId ?? deliverable.project.leadId;
  if (approved) {
    // Pre-aprobada y enviada al cliente: la etapa de revisión TERMINÓ para todos, así que
    // la tarea «Pre-aprobar…» se completa a TODOS los co-revisores (uno aprobó por el equipo).
    await closeDeliverableAutoTasks(deliverableId, ["review"]);
    await createDeliverableAutoTask({
      projectId,
      deliverableId,
      title: autoTaskTitles.deliver(deliverable.name, versionNumber),
      description: "La versión quedó pre-aprobada y ya está en el portal del cliente. Comparte el enlace de revisión y completa portada, copy y descargas si faltan. Cuando el cliente decida, esta tarea se completa sola.",
      assigneeId: uploaderId,
      dueAt: deliverable.reviewExpiresAt,
      actorId: session!.id,
    });
  } else {
    // Cambios solicitados: quien decidió CUMPLIÓ su revisión (solo se cierra SU tarea).
    // La del otro co-revisor sigue viva hasta el límite de pre-aprobación: si comenta,
    // cumple; si lo deja vencer sin revisar, el barrido la cierra con incumplimiento.
    await closeDeliverableAutoTasks(deliverableId, ["review"], { assigneeId: session!.id });
    await createDeliverableAutoTask({
      projectId,
      deliverableId,
      title: autoTaskTitles.fix(deliverable.name, versionNumber),
      description: `Aplica los cambios solicitados${note ? `: ${note.slice(0, 300)}` : ""}. El checklist con capturas está en el entregable. Al subir la nueva versión, esta tarea se completa sola.${fixDueAt ? " Si la corrección llega después del plazo, queda como incumplida." : ""}`,
      assigneeId: uploaderId,
      dueAt: fixDueAt ?? deliverable.reviewExpiresAt,
      actorId: session!.id,
    });
  }
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
        event: "review_changes",
        title: `Cambios solicitados: ${deliverable.name}`,
        body: `${session!.name} pidió cambios en la v${versionNumber} de «${deliverable.project.name}»${changeCount ? ` · ${changeCount} ${changeCount === 1 ? "punto" : "puntos"} en el checklist` : ""}.${fixDueAt ? ` Plazo de la corrección: ${formatBogota(fixDueAt)}.` : ""}${note ? ` Nota: ${note.slice(0, 300)}` : ""}`,
        link: `/revisiones/${deliverableId}`,
        actorId: session!.id,
      },
    );
  }
  refresh(projectId);
}

// Revocar / restaurar el enlace de revisión del cliente.
export async function setReviewRevoked(deliverableId: string, _projectId: string, revoked: boolean) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) noAutorizado();
  await db.deliverable.update({ where: { id: deliverableId }, data: { reviewRevokedAt: revoked ? new Date() : null } });
  await logActivity({ action: "deliverable.review_link", summary: revoked ? `revocó el enlace de revisión de «${deliverable.name}»` : `reactivó el enlace de revisión de «${deliverable.name}»`, projectId: deliverable.projectId, entityType: "deliverable", entityId: deliverableId });
  refresh(deliverable.projectId);
}

// Archivar / desarchivar un entregable desde la bandeja de gestión (/revisiones). Archivar solo lo
// SACA del inbox activo: NO toca el enlace de entrega (sigue vivo). Para inutilizar el enlace está
// "Revocar" (setReviewRevoked) o borrar el entregable. Mismo alcance que revocar/borrar (canManage).
export async function setDeliverableArchived(deliverableId: string, _projectId: string, archived: boolean) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) noAutorizado();
  await db.deliverable.update({ where: { id: deliverableId }, data: { archivedAt: archived ? new Date() : null } });
  await logActivity({ action: "deliverable.archive", summary: archived ? `archivó el entregable «${deliverable.name}»` : `desarchivó el entregable «${deliverable.name}»`, projectId: deliverable.projectId, entityType: "deliverable", entityId: deliverableId });
  refresh(deliverable.projectId);
}

// Activar / desactivar el modo dibujos (anotación) en el portal del cliente.
export async function setReviewDrawings(deliverableId: string, _projectId: string, allow: boolean) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canManageProject(deliverable.project, session)) noAutorizado();
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
  if (!c || !canWriteProject(c.deliverable.project, session)) noAutorizado();
  // Trazabilidad: quién la marcó como hecha y cuándo (se ve en ambos lados, equipo y cliente).
  // Al REABRIRLA se limpia, para que no quede un «hecho por» de una corrección pendiente.
  await db.reviewComment.update({
    where: { id: commentId },
    data: resolved
      ? { resolved: true, resolvedAt: new Date(), resolvedById: session!.id }
      : { resolved: false, resolvedAt: null, resolvedById: null },
  });
  if (resolved) {
    const change = c.body.replace(/^\(anotación\)$/, "anotación").slice(0, 80);
    await notifyMany(
      [c.deliverable.project.leadId, ...c.deliverable.project.members.map((m) => m.userId)].filter(
        (id) => id && id !== session!.id,
      ),
      {
        type: "review",
        event: "review_checklist",
        title: `Cambio realizado: ${c.deliverable.name}`,
        body: `${session!.name} marcó como hecho: «${change}»`,
        link: `/revisiones/${c.deliverableId}`,
        actorId: session!.id,
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

// Edita el texto de una corrección del EQUIPO, por su autor o quien gestiona el proyecto.
// Se permite también cuando YA está sellada («Solicitar cambios»): corregir una redacción mala
// es más útil que dejarla inmutable; queda constancia con editedAt. Lo que NO se toca nunca es
// un comentario del CLIENTE (no somos quién para reescribir lo que él dijo).
export async function editReviewComment(commentId: string, _projectId: string, body: string) {
  const c = await reviewCommentForMutation(commentId);
  const session = await getSession();
  if (!c || !canWriteProject(c.deliverable.project, session)) noAutorizado();
  const mine = c.authorUserId === session!.id;
  if (!mine && !canManageProject(c.deliverable.project, session)) noAutorizado();
  if (c.fromClient) throw new Error("No se puede editar un comentario del cliente.");
  const next = body.trim().slice(0, 4000);
  if (!next) throw new Error("El comentario no puede quedar vacío.");
  // editedAt solo cuando ya estaba sellada: en borrador, editar es lo normal y no merece marca.
  await db.reviewComment.update({
    where: { id: commentId },
    data: { body: next, ...(c.lockedAt ? { editedAt: new Date() } : {}) },
  });
  // Sin revalidar: el workspace lo refleja de forma optimista (no reinicia el video).
}

// Retira una corrección del EQUIPO (borrador o ya enviada), con las mismas reglas que editar.
// Retirar una corrección enviada es legítimo: a veces se pide un cambio que luego se descarta.
export async function deleteReviewComment(commentId: string, _projectId: string) {
  const c = await reviewCommentForMutation(commentId);
  const session = await getSession();
  if (!c || !canWriteProject(c.deliverable.project, session)) noAutorizado();
  const mine = c.authorUserId === session!.id;
  if (!mine && !canManageProject(c.deliverable.project, session)) noAutorizado();
  if (c.fromClient) throw new Error("No se puede borrar un comentario del cliente.");
  await db.reviewComment.delete({ where: { id: commentId } }); // las respuestas del hilo caen en cascada
}

// Marca una corrección como OBLIGATORIA (bloqueante) o SUGERENCIA (opcional), para que el editor
// sepa qué es imprescindible. Solo sobre correcciones del equipo, por su autor o quien gestiona.
export async function setReviewCommentPriority(commentId: string, _projectId: string, priority: "OBLIGATORIA" | "SUGERENCIA") {
  const c = await reviewCommentForMutation(commentId);
  const session = await getSession();
  if (!c || !canWriteProject(c.deliverable.project, session)) noAutorizado();
  const mine = c.authorUserId === session!.id;
  if (!mine && !canManageProject(c.deliverable.project, session)) noAutorizado();
  if (priority !== "OBLIGATORIA" && priority !== "SUGERENCIA") throw new Error("Prioridad inválida.");
  await db.reviewComment.update({ where: { id: commentId }, data: { priority } });
  // Sin revalidar: la UI lo refleja de forma optimista (no reinicia el video).
}

// Responde ANCLADO a una corrección concreta (hilo), en vez de dejar una respuesta suelta.
// `visibleToClient` decide si la respuesta se ve en el portal del cliente: se responde al
// cliente en su hilo, o se discute internamente bajo una corrección del equipo.
export async function replyToReviewComment(commentId: string, _projectId: string, body: string, visibleToClient: boolean) {
  const parent = await db.reviewComment.findUnique({
    where: { id: commentId },
    select: {
      deliverableId: true,
      versionNumber: true,
      parentId: true,
      fromClient: true,
      deliverable: { select: { name: true, projectId: true, project: { select: accessSelect } } },
    },
  });
  const session = await getSession();
  if (!parent || !canWriteProject(parent.deliverable.project, session)) noAutorizado();
  const next = body.trim().slice(0, 4000);
  if (!next) throw new Error("La respuesta no puede quedar vacía.");
  // Hilos de UN nivel: responder a una respuesta cuelga de la misma corrección madre.
  const rootId = parent.parentId ?? commentId;
  const me = await db.user.findUnique({ where: { id: session!.id }, select: { name: true } });
  const created = await db.reviewComment.create({
    data: {
      deliverableId: parent.deliverableId,
      parentId: rootId,
      authorUserId: session!.id,
      authorName: me?.name ?? "Equipo",
      body: next,
      versionNumber: parent.versionNumber,
      fromClient: false,
      visibleToClient,
      // Una respuesta no es una corrección: no debe contar en el checklist como bloqueante.
      priority: "SUGERENCIA",
    },
    select: { id: true },
  });
  await logActivity({
    action: "deliverable.reply_thread",
    summary: `respondió en la revisión de «${parent.deliverable.name}»`,
    projectId: parent.deliverable.projectId,
    entityType: "deliverable",
    entityId: parent.deliverableId,
  });
  return created.id;
}

// Respuesta del equipo a la revisión del cliente (se ve en el portal público).
export async function replyToReview(deliverableId: string, _projectId: string, formData: FormData) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canWriteProject(deliverable.project, session)) noAutorizado();
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  if (!body) return;
  const me = await db.user.findUnique({ where: { id: session!.id }, select: { name: true } });
  // visibleToClient: es una respuesta DIRIGIDA al cliente → el portal público la incluye
  // (a diferencia de los comentarios internos de pre-aprobación, que nunca salen).
  await db.reviewComment.create({
    data: { deliverableId, authorName: me?.name ?? "Equipo", body, fromClient: false, visibleToClient: true },
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
  if (!deliverable || !canWriteProject(deliverable.project, session)) noAutorizado();
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
      // El cliente (composite()) recomprime el fotograma para caber bajo este tope; subirlo a
      // 500 000 evita descartar en silencio la captura de un reel vertical recargado.
      if (drawingRaw.length <= 500_000) drawingData = parsed;
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
  const session = await ensureProjectAccess(projectId, "subir_archivos");
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

// Añade una RUTA DE RED (SMB) del NAS al proyecto: no sube nada, solo guarda la ruta
// (\\servidor\carpeta o smb://…) para copiar/pegar en el explorador. kind = NAS.
export async function addNasRoute(projectId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId, "subir_archivos");
  // El cliente no maneja rutas de red internas (SMB/NAS): puede subir archivos y enlaces, no rutas.
  if (session.role === "cliente") noAutorizado();
  const name = String(formData.get("name") ?? "").trim();
  const path = String(formData.get("path") ?? "").trim();
  if (!name || !path) return;
  // Acepta UNC (\\srv\share), smb:// y rutas absolutas locales; nada de http(s) ni javascript.
  if (!/^(\\\\|smb:\/\/|\/\/|[a-zA-Z]:\\|\/)/.test(path) || /^\s*(javascript|data|http):/i.test(path)) return;
  const folderId = String(formData.get("folderId") ?? "") || null;
  const f = await db.fileAsset.create({
    data: { projectId, name, path, folderId, kind: "NAS", uploadedById: session.id },
  });
  await logActivity({ action: "file.nas", summary: `añadió la ruta de red «${name}»`, projectId, entityType: "file", entityId: f.id });
  refresh(projectId);
}

// Subir archivos LOCALES al proyecto (se guardan en el storage del NAS y se pueden
// editar con OnlyOffice). Distinto de addFile, que solo guarda enlaces.
// Extensiones ejecutables/peligrosas que no se permiten subir.
const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|scr|pif|cpl|jar|js|vbs|ps1|sh|app|dmg|deb|rpm)$/i;
const MAX_UPLOAD = 100 * 1024 * 1024; // 100 MB por archivo (coincide con bodySizeLimit)

export async function uploadProjectFiles(projectId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId, "subir_archivos");
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

// Sube uno o varios guiones del proyecto: documentos de Word (editables en OnlyOffice) o PDF
// (se abren en el visor-editor de PDF de OnlyOffice para ver/anotar y se les puede copiar el texto).
export async function uploadGuiones(projectId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId, "subir_archivos");
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0 && f.size <= MAX_UPLOAD && !BLOCKED_EXT.test(f.name))
    .filter((f) => {
      const t = officeType(f.name);
      return t === "word" || t === "pdf";
    });
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
  const session = await ensureProjectAccess(projectId, "subir_archivos");
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
  const ooCfg = await getOnlyOfficeConfig();
  if (!ooCfg.enabled) return { ok: false, error: "OnlyOffice no está conectado: no se puede extraer el texto." };
  try {
    const token = signFileToken(fileId);
    const sourceUrl = `${ooCfg.callbackBase}/api/files-asset/${fileId}?t=${token}`;
    const text = await convertOfficeToText({ fileId, name: file.name, version: file.version, sourceUrl });
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo extraer el texto." };
  }
}

export async function deleteFile(fileId: string, _projectId: string) {
  const file = await db.fileAsset.findUnique({ where: { id: fileId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(file, "eliminar_archivos");
  await db.fileAsset.delete({ where: { id: fileId } });
  await logActivity({ action: "file.delete", summary: `eliminó el archivo «${file!.name}»`, projectId, entityType: "file", entityId: fileId });
  refresh(projectId);
}

// ── Carpetas (personalizables: nombre, icono, color; se pueden crear y borrar) ──
export async function createFolder(projectId: string, formData: FormData) {
  await ensureProjectAccess(projectId, "subir_archivos");
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
  const projectId = await ensureAccessVia(folder, "subir_archivos");
  const name = String(formData.get("name") ?? "").trim() || folder!.name;
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  await db.projectFolder.update({ where: { id: folderId }, data: { name, icon, color } });
  await logActivity({ action: "folder.update", summary: `editó la carpeta «${name}»`, projectId, entityType: "folder", entityId: folderId });
  refresh(projectId);
}

export async function deleteFolder(folderId: string, _projectId: string) {
  const folder = await db.projectFolder.findUnique({ where: { id: folderId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(folder, "eliminar_archivos");
  // Los archivos de la carpeta quedan "sin carpeta" (folderId → null por onDelete: SetNull).
  await db.projectFolder.delete({ where: { id: folderId } });
  await logActivity({ action: "folder.delete", summary: `eliminó la carpeta «${folder!.name}»`, projectId, entityType: "folder", entityId: folderId });
  refresh(projectId);
}

// ── Proyecto compartido: visibilidad y miembros (solo gestores) ──
async function ensureProjectManage(projectId: string, perm?: string): Promise<SessionUser> {
  const session = await getSession();
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project || !canManageProject(project, session)) noAutorizado();
  if (perm && !hasPermission(session, perm)) noAutorizado();
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
  const projectId = await ensureAccessVia(deliverable, "gestionar_cronograma");
  const raw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  await db.deliverable.update({ where: { id }, data: { dueDate } });
  await logActivity({ action: "deliverable.dueDate", summary: raw ? `fijó la entrega de «${deliverable!.name}» el ${raw}` : `quitó la entrega de «${deliverable!.name}»`, projectId, entityType: "deliverable", entityId: id });
  revalidatePath("/proyectos");
  refresh(projectId);
}

export async function setProjectVisibility(projectId: string, isPrivate: boolean) {
  await ensureProjectManage(projectId, "editar_proyectos");
  await db.project.update({ where: { id: projectId }, data: { isPrivate } });
  await logActivity({ action: "project.visibility", summary: `marcó el proyecto como ${isPrivate ? "privado" : "público"}`, projectId, entityType: "project", entityId: projectId });
  refresh(projectId);
}

export async function addProjectMember(projectId: string, userId: string, role: string = "MEMBER") {
  const session = await ensureProjectManage(projectId, "gestionar_miembros_proyecto");
  // El rol debe ser uno conocido; conceder OWNER solo lo puede hacer admin o el responsable
  // (evita que un OWNER no-admin promueva a otros y escale control del proyecto).
  const safeRole = isProjectRole(role) ? role : "MEMBER";
  if (safeRole === "OWNER") {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { leadId: true } });
    if (!(session.role === "admin" || project?.leadId === session.id)) {
      throw new Error("Solo un administrador o el responsable puede asignar OWNER");
    }
  }
  // El usuario debe existir y estar activo (no se invita a ids arbitrarios).
  const target = await db.user.findUnique({ where: { id: userId }, select: { active: true, name: true, role: { select: { key: true } } } });
  if (!target?.active) throw new Error("Usuario inválido");
  // Los usuarios CLIENTE entran SIEMPRE como invitados (GUEST = solo lectura), aunque se les comparta
  // un proyecto: ven/comentan/suben su guion, pero nunca editan tareas ni gestionan el proyecto.
  const finalRole = target.role?.key === "cliente" ? "GUEST" : safeRole;

  await db.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role: finalRole },
    update: { role: finalRole },
  });
  await logActivity({ action: "member.add", summary: `añadió a ${target.name ?? "un miembro"} como ${finalRole}`, projectId, entityType: "member", entityId: userId });
  // Estar en el proyecto ES estar en su chat: sincroniza la membresía de los canales (interno y, si
  // hay invitado, el "con el cliente"). Al invitar a un CLIENTE se crea además el canal con el cliente.
  await ensureProjectChannels(projectId);
  refresh(projectId);
}

export async function removeProjectMember(projectId: string, userId: string) {
  await ensureProjectManage(projectId, "gestionar_miembros_proyecto");
  await db.projectMember
    .delete({ where: { projectId_userId: { projectId, userId } } })
    .catch((e: { code?: string }) => {
      if (e?.code !== "P2025") throw e; // P2025 = no existe → ignorar; el resto propaga
    });
  const member = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await logActivity({ action: "member.remove", summary: `quitó a ${member?.name ?? "un miembro"} del proyecto`, projectId, entityType: "member", entityId: userId });
  // Al salir del proyecto también sale del chat: re-sincroniza la membresía de los canales.
  await ensureProjectChannels(projectId);
  refresh(projectId);
}

// ── Papelera (borrado SUAVE de proyectos) ──
// Archivar = sacarlo de las listas pero conservar TODO (tareas, archivos, entregables, chat);
// restaurable desde la papelera. No hay borrado físico. Exige eliminar_proyectos + gestionar el
// proyecto (admin/líder/owner). Idempotente.
//
// PRE-VUELO: getArchivePreflight cuenta lo que sigue "vivo" (tareas abiertas, enlaces públicos,
// recurrentes, avisos) para que el modal lo muestre ANTES de confirmar. Los filtros de proyecto
// dormido (Fase 1) ya silencian todo eso mientras esté en la papelera — restaurar lo despierta —;
// las opciones de archiveProject son las acciones ADICIONALES e irreversibles-a-mano:
// revocar los enlaces públicos (rota el nonce / marca reviewRevokedAt) y avisar al equipo.
export type ArchivePreflight = {
  openTasks: number;   // tareas sin completar (se silencian solas al archivar)
  publicLinks: number; // enlace de subida vivo + enlaces de revisión activos de cara al cliente
  recurring: number;   // reglas recurrentes activas (dejan de parir tareas mientras duerma)
  reminders: number;   // avisos de recordatorio pendientes atados a tareas/citas del proyecto
  team: number;        // personas del equipo a las que se puede avisar (sin clientes, sin ti)
};

// Estados en los que un entregable está DE CARA AL CLIENTE (espejo de review/[token]/actions.ts):
// solo esos cuentan como "enlace de revisión activo" — el portal no sirve los demás.
const CLIENT_FACING_STATES = ["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"];

export async function getArchivePreflight(projectId: string): Promise<ArchivePreflight | null> {
  let session: SessionUser;
  try {
    session = await ensureProjectManage(projectId, "eliminar_proyectos");
  } catch {
    return null;
  }
  const [project, openTasks, reviewLinks, recurring, reminders] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: {
        uploadNonce: true, uploadRevokedAt: true, leadId: true,
        members: { select: { userId: true, user: { select: { role: { select: { key: true } } } } } },
      },
    }),
    db.task.count({ where: { projectId, completedAt: null } }),
    db.deliverable.count({ where: { projectId, archivedAt: null, reviewRevokedAt: null, status: { in: CLIENT_FACING_STATES as never } } }),
    db.recurringTask.count({ where: { projectId, active: true } }),
    db.reminderAlert.count({
      where: { active: true, sentAt: null, reminder: { doneAt: null, OR: [{ task: { projectId } }, { event: { projectId } }] } },
    }),
  ]);
  if (!project) return null;
  const uploadLive = !!project.uploadNonce && !project.uploadRevokedAt;
  // Equipo avisable: responsable + miembros que NO son usuarios del portal cliente, sin el actor.
  const teamIds = new Set<string>();
  if (project.leadId) teamIds.add(project.leadId);
  for (const m of project.members) if (m.user?.role?.key !== "cliente") teamIds.add(m.userId);
  teamIds.delete(session.id);
  return {
    openTasks,
    publicLinks: reviewLinks + (uploadLive ? 1 : 0),
    recurring,
    reminders,
    team: teamIds.size,
  };
}

export async function archiveProject(
  projectId: string,
  opts?: { revokeLinks?: boolean; notifyTeam?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  let session: SessionUser;
  try {
    session = await ensureProjectManage(projectId, "eliminar_proyectos");
  } catch {
    return { ok: false, error: "No autorizado para borrar este proyecto." };
  }
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      name: true, archivedAt: true, leadId: true, uploadNonce: true, uploadRevokedAt: true,
      members: { select: { userId: true, user: { select: { role: { select: { key: true } } } } } },
    },
  });
  if (!project) return { ok: false, error: "El proyecto no existe." };
  if (project.archivedAt) return { ok: true }; // ya archivado
  await db.project.update({ where: { id: projectId }, data: { archivedAt: new Date() } });
  // Revocar ENLACES PÚBLICOS (opcional, elegido en el pre-vuelo): el de subida rota el nonce
  // (una URL filtrada muere para siempre) y los de revisión quedan revocados por entregable.
  // Nota: la Fase 1 ya bloquea ambos portales mientras el proyecto esté en la papelera; esto
  // los mata también para DESPUÉS de una eventual restauración (hay que recrearlos a mano).
  if (opts?.revokeLinks) {
    if (project.uploadNonce && !project.uploadRevokedAt) {
      await db.project.update({ where: { id: projectId }, data: { uploadRevokedAt: new Date(), uploadNonce: crypto.randomUUID() } }).catch(() => null);
    }
    await db.deliverable.updateMany({ where: { projectId, reviewRevokedAt: null }, data: { reviewRevokedAt: new Date() } }).catch(() => null);
  }
  // Avisar al EQUIPO (opcional): responsable + miembros no-cliente, sin el actor.
  if (opts?.notifyTeam) {
    const teamIds = new Set<string>();
    if (project.leadId) teamIds.add(project.leadId);
    for (const m of project.members) if (m.user?.role?.key !== "cliente") teamIds.add(m.userId);
    teamIds.delete(session.id);
    if (teamIds.size) {
      await notifyMany([...teamIds], {
        type: "project",
        event: "project_archived",
        title: `«${project.name}» pasó a la papelera`,
        body: "El proyecto quedó en solo lectura; se puede restaurar desde la Papelera.",
        link: `/proyectos/${projectId}`,
        actorId: session.id,
      }).catch(() => null);
    }
  }
  await logActivity({ action: "project.archive", summary: `envió a la papelera el proyecto «${project.name}»`, projectId, entityType: "project", entityId: projectId });
  revalidatePath("/proyectos");
  revalidatePath("/papelera");
  revalidatePath("/", "layout");
  return { ok: true };
}

// RESUMEN DE CIERRE: lo que el modal de «Terminar» muestra antes de confirmar — el broche del
// proyecto en números (tareas, entregables aprobados, horas registradas) y el único aviso que
// importa de verdad: facturas sin cobrar (terminar NO las toca; se siguen en Facturación).
export type FinishSummary = {
  tasksTotal: number;
  tasksOpen: number; // sin completar: se silencian solas al terminar (no cuentan como pendientes)
  deliverablesTotal: number;
  deliverablesApproved: number; // en APROBADO o ENTREGADO
  minutes: number; // suma de TimeEntry del proyecto (el cliente lo formatea en horas)
  invoicesPending: number; // ENVIADA o VENCIDA = cobro pendiente
};

export async function getFinishSummary(projectId: string): Promise<FinishSummary | null> {
  try {
    await ensureProjectManage(projectId);
  } catch {
    return null;
  }
  const [tasksTotal, tasksOpen, deliverablesTotal, deliverablesApproved, time, invoicesPending] = await Promise.all([
    db.task.count({ where: { projectId } }),
    db.task.count({ where: { projectId, completedAt: null } }),
    db.deliverable.count({ where: { projectId, archivedAt: null } }),
    db.deliverable.count({ where: { projectId, archivedAt: null, status: { in: ["APROBADO", "ENTREGADO"] as never } } }),
    db.timeEntry.aggregate({ _sum: { minutes: true }, where: { task: { projectId } } }),
    db.invoice.count({ where: { projectId, status: { in: ["ENVIADA", "VENCIDA"] as never } } }),
  ]);
  return {
    tasksTotal,
    tasksOpen,
    deliverablesTotal,
    deliverablesApproved,
    minutes: time._sum.minutes ?? 0,
    invoicesPending,
  };
}

// Marca un proyecto como TERMINADO: sale de las listas ACTIVAS y va al archivo de «Terminados»
// (NO a la papelera). Conserva todo y se puede REABRIR. Lo hace quien gestiona el proyecto.
export async function finishProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  let session: SessionUser;
  try {
    session = await ensureProjectManage(projectId);
  } catch {
    return { ok: false, error: "No autorizado para terminar este proyecto." };
  }
  const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true, finishedAt: true, archivedAt: true, status: true } });
  if (!project) return { ok: false, error: "El proyecto no existe." };
  if (project.archivedAt) return { ok: false, error: "El proyecto está en la papelera; restáuralo primero." };
  if (project.finishedAt) return { ok: true }; // ya terminado
  // Estados sincronizados: TERMINAR deja también el status en un estado de cierre. Si ya está
  // en Entregado/Cerrado/Cancelado se respeta; si no, salta a ENTREGADO — un solo gesto y el
  // Pipeline, la tabla y los reportes cuentan la misma historia.
  const endStates = ["ENTREGADO", "CERRADO", "CANCELADO"];
  await db.project.update({
    where: { id: projectId },
    data: { finishedAt: new Date(), finishedById: session.id, ...(endStates.includes(project.status) ? {} : { status: "ENTREGADO" }) },
  });
  await logActivity({ action: "project.finish", summary: `marcó como TERMINADO el proyecto «${project.name}»`, projectId, entityType: "project", entityId: projectId });
  revalidatePath("/proyectos");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Reabre/retoma un proyecto TERMINADO: vuelve a las listas activas. Lo hace quien gestiona el proyecto.
export async function reopenProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureProjectManage(projectId);
  } catch {
    return { ok: false, error: "No autorizado para reabrir este proyecto." };
  }
  const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true, client: { select: { id: true, isActive: true } } } });
  if (!project) return { ok: false, error: "El proyecto no existe." };
  await db.project.update({ where: { id: projectId }, data: { finishedAt: null, finishedById: null } });
  // Si el cliente estaba en el ARCHIVO (inactivo por trabajo terminado), restaurar uno de sus
  // proyectos lo REACTIVA: vuelve al menú y a las listas para poder trabajar de inmediato.
  if (project.client && !project.client.isActive) {
    await db.client.update({ where: { id: project.client.id }, data: { isActive: true } });
  }
  await logActivity({ action: "project.reopen", summary: `reabrió el proyecto «${project.name}»`, projectId, entityType: "project", entityId: projectId });
  revalidatePath("/proyectos");
  revalidatePath("/clientes");
  revalidatePath("/", "layout");
  return { ok: true };
}

// El CLIENTE (o cualquier miembro) pide RETOMAR un proyecto terminado: no lo reabre —solo avisa al
// equipo—. El equipo decide y usa reopenProject. Anti-spam: 1 solicitud por proyecto/persona / 10 min.
export async function requestReopenProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado." };
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      name: true, leadId: true, finishedAt: true,
      members: { select: { userId: true } },
      client: { select: { members: { select: { userId: true } } } },
    },
  });
  if (!project) return { ok: false, error: "El proyecto no existe." };
  if (!project.finishedAt) return { ok: true }; // ya activo: nada que pedir
  // El solicitante debe pertenecer al proyecto (miembro del equipo o del cliente) o ser admin.
  const clientIds = new Set((project.client?.members ?? []).map((m) => m.userId));
  const isMember =
    project.leadId === session.id ||
    project.members.some((m) => m.userId === session.id) ||
    clientIds.has(session.id);
  if (!isMember && session.role !== "admin") return { ok: false, error: "No autorizado." };
  if (!rateLimit(`reopen-req:${projectId}:${session.id}`, 1, 10 * 60_000)) return { ok: true }; // ya pidió hace poco
  // Avisa al EQUIPO (responsable + miembros no-cliente + admins); nunca a otros clientes.
  const teamIds = new Set<string>();
  if (project.leadId) teamIds.add(project.leadId);
  project.members.forEach((m) => teamIds.add(m.userId));
  const admins = await db.user.findMany({ where: { active: true, role: { key: "admin" } }, select: { id: true } });
  admins.forEach((a) => teamIds.add(a.id));
  teamIds.delete(session.id);
  const recipients = [...teamIds].filter((id) => !clientIds.has(id));
  if (recipients.length) {
    await notifyMany(recipients, {
      type: "project",
      event: "project_reopen_request",
      title: `${session.name} pidió retomar «${project.name}»`,
      body: "El cliente quiere reabrir/editar este proyecto terminado.",
      link: `/proyectos/${projectId}`,
      actorId: session.id,
    }).catch(() => null);
  }
  await logActivity({ action: "project.reopen_request", summary: `pidió retomar el proyecto «${project.name}»`, projectId, entityType: "project", entityId: projectId }).catch(() => null);
  return { ok: true };
}

// Restaura un proyecto archivado (vuelve a las listas). Lo hace quien puede ver la papelera.
export async function restoreProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!hasPermission(session, "ver_papelera")) noAutorizado();
  // Además del permiso de papelera, exige poder GESTIONAR ese proyecto concreto: no restaurar
  // proyectos ajenos/privados solo por tener ver_papelera.
  await ensureProjectManage(projectId);
  const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true, client: { select: { name: true, archivedAt: true } } } });
  if (!project) return { ok: false, error: "El proyecto no existe." };
  // Coherencia con el ARRASTRE de archiveClient: si el cliente sigue en la papelera, restaurar
  // solo el proyecto lo dejaría huérfano (sin cliente visible en sidebar ni listas). Primero
  // se restaura el cliente — eso revive de una los proyectos que arrastró.
  if (project.client?.archivedAt) {
    return { ok: false, error: `El cliente «${project.client.name}» está en la papelera; restáuralo primero (eso revive también sus proyectos).` };
  }
  await db.project.update({ where: { id: projectId }, data: { archivedAt: null } });
  await logActivity({ action: "project.restore", summary: `restauró el proyecto «${project.name}» de la papelera`, projectId, entityType: "project", entityId: projectId });
  revalidatePath("/proyectos");
  revalidatePath("/papelera");
  revalidatePath("/", "layout");
  return { ok: true };
}

// PRE-VUELO de purga: lo que el diálogo de «Borrar definitivamente» muestra CON NÚMEROS antes
// de exigir escribir el nombre. Muere en cascada: tareas, archivos, entregables, canal de chat.
// Se conservan (desvinculados, SetNull): cotizaciones y facturas — registros financieros.
export type ProjectPurgePreflight = {
  tasks: number;
  files: number;
  deliverables: number;
  quotes: number;   // se conservan desvinculadas
  invoices: number; // se conservan desvinculadas
};

export async function getProjectPurgePreflight(projectId: string): Promise<ProjectPurgePreflight | null> {
  const session = await getSession();
  if (!hasPermission(session, "ver_papelera")) return null;
  try {
    await ensureProjectManage(projectId, "eliminar_proyectos");
  } catch {
    return null;
  }
  const [tasks, files, deliverables, quotes, invoices] = await Promise.all([
    db.task.count({ where: { projectId } }),
    db.fileAsset.count({ where: { projectId } }),
    db.deliverable.count({ where: { projectId } }),
    db.quote.count({ where: { projectId } }),
    db.invoice.count({ where: { projectId } }),
  ]);
  return { tasks, files, deliverables, quotes, invoices };
}

// Borra DEFINITIVAMENTE un proyecto desde la papelera (irreversible). Solo sobre proyectos ya
// archivados. Cascada: borra tareas/entregables/archivos/canal/etc.; las cotizaciones, FACTURAS
// y citas son SetNull → sobreviven desvinculadas (no se pierden registros financieros).
export async function purgeProject(projectId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!hasPermission(session, "ver_papelera")) return { ok: false, error: "No autorizado" };
  // Borrado DEFINITIVO (cascada): además de papelera, exige gestionar el proyecto y el permiso
  // de eliminar (igual que archiveProject). No purgar proyectos ajenos por adivinar el id.
  try {
    await ensureProjectManage(projectId, "eliminar_proyectos");
  } catch {
    return { ok: false, error: "No autorizado para borrar este proyecto." };
  }
  const project = await db.project.findUnique({ where: { id: projectId }, select: { name: true, archivedAt: true } });
  if (!project) return { ok: false, error: "El proyecto no existe." };
  if (!project.archivedAt) return { ok: false, error: "Primero envía el proyecto a la papelera." };
  try {
    await db.project.delete({ where: { id: projectId } });
  } catch {
    return { ok: false, error: "No se pudo borrar el proyecto." };
  }
  await logActivity({ action: "project.purge", summary: `borró definitivamente el proyecto «${project.name}»` });
  revalidatePath("/papelera");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────
// Portal del cliente (rol "cliente"): comentar y aprobar SUS entregables desde la app.
// Mismos efectos que el portal público de revisión (/review/[token]) pero autenticados por SESIÓN
// (rol cliente + miembro del proyecto + permiso del catálogo), no por token. El cliente solo
// actúa sobre material que el equipo ya aprobó internamente (versión internalApproved) y sobre
// entregables ya enviados a su revisión.
// ─────────────────────────────────────────────

// Resuelve y autoriza una acción de cliente sobre un entregable: rol cliente, con el permiso
// indicado, y miembro del proyecto del entregable. Devuelve la sesión y el entregable.
async function ensureClienteDeliverable(deliverableId: string, perm: string) {
  const session = await getSession();
  if (!session || session.role !== "cliente" || !hasPermission(session, perm)) noAutorizado();
  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { id: true, name: true, projectId: true, status: true, project: { select: { ...accessSelect, name: true } } },
  });
  if (!deliverable || !deliverable.project.members.some((m) => m.userId === session.id)) noAutorizado();
  return { session, deliverable };
}

// IDs del equipo a avisar cuando el cliente actúa (responsable + miembros, sin el propio cliente).
function clienteTeamIds(project: { leadId: string | null; members: { userId: string }[] }, exceptId: string): string[] {
  return [project.leadId, ...project.members.map((m) => m.userId)].filter((id): id is string => Boolean(id) && id !== exceptId);
}

// Avisa (in-app + correo) a los MIEMBROS CLIENTE de un proyecto (usuarios con rol "cliente").
// Se usa cuando el equipo termina algo relevante para el cliente: entregable listo, fecha movida.
async function notifyProjectClients(projectId: string, n: NotifyInput) {
  const members = await db.projectMember.findMany({
    where: { projectId, user: { role: { key: "cliente" } } },
    select: { userId: true },
  });
  if (members.length) await notifyManyAndEmail(members.map((m) => m.userId), n);
}

// El cliente comenta un entregable (feedback). Se guarda como comentario del cliente y avisa al equipo.
export async function clientCommentDeliverable(deliverableId: string, versionNumber: number | null, body: string) {
  const { session, deliverable } = await ensureClienteDeliverable(deliverableId, "comentar");
  const text = body.trim().slice(0, 4000);
  if (!text) return;
  await db.reviewComment.create({
    data: { deliverableId, authorName: session.name, authorUserId: session.id, body: text, versionNumber: versionNumber ?? null, fromClient: true },
  });
  await logActivity({
    action: "deliverable.client_comment",
    summary: `comentó la revisión de «${deliverable.name}»`,
    projectId: deliverable.projectId,
    entityType: "deliverable",
    entityId: deliverableId,
    actorName: `${session.name} (cliente)`,
  });
  await notifyManyAndEmail(clienteTeamIds(deliverable.project, session.id), {
    type: "review",
    event: "review_client",
    title: `Comentario del cliente: ${deliverable.name}`,
    body: `${session.name} comentó «${deliverable.project.name}».`,
    link: `/revisiones/${deliverableId}`,
    actorId: session.id,
  });
  refresh(deliverable.projectId);
}

// El cliente decide sobre su entregable: aprobar o solicitar cambios. Solo si está en etapa de
// cliente (ENVIADO_CLIENTE/CORRECCIONES) y hay una versión final (internalApproved) disponible.
export async function clientDecideDeliverable(deliverableId: string, decision: "APROBADO" | "CAMBIOS", note?: string) {
  const { session, deliverable } = await ensureClienteDeliverable(deliverableId, "aprobar_cliente");
  if (deliverable.status !== "ENVIADO_CLIENTE" && deliverable.status !== "CORRECCIONES") {
    throw new Error("Este entregable ya no está disponible para decidir.");
  }
  const latestApproved = await db.deliverableVersion.findFirst({
    where: { deliverableId, internalApproved: true },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  if (!latestApproved) throw new Error("Aún no hay una versión final disponible.");
  const approved = decision === "APROBADO";
  await db.deliverable.update({ where: { id: deliverableId }, data: { status: approved ? "APROBADO" : "CORRECCIONES" } });
  await db.deliverableDecision.create({
    data: { deliverableId, versionNumber: latestApproved.number, stage: "CLIENTE", result: approved ? "APROBADO" : "CAMBIOS", byUserId: session.id, byName: session.name, note: note?.slice(0, 1000) || null },
  });
  await db.reviewComment.create({
    data: {
      deliverableId,
      authorName: session.name,
      authorUserId: session.id,
      body: approved ? "✅ Aprobó el entregable." : `✏️ Solicitó cambios.${note ? ` ${note.trim().slice(0, 300)}` : ""}`,
      versionNumber: latestApproved.number,
      fromClient: true,
    },
  });
  await logActivity({
    action: approved ? "deliverable.client_approved" : "deliverable.client_changes",
    summary: approved ? `aprobó la revisión de «${deliverable.name}»` : `solicitó cambios en «${deliverable.name}»`,
    projectId: deliverable.projectId,
    entityType: "deliverable",
    entityId: deliverableId,
    actorName: `${session.name} (cliente)`,
  });
  await notifyManyAndEmail(clienteTeamIds(deliverable.project, session.id), {
    type: "review",
    event: "review_client",
    title: approved ? `Cliente aprobó: ${deliverable.name}` : `Cliente pidió cambios: ${deliverable.name}`,
    body: approved ? `${session.name} aprobó el entregable.` : `${session.name} solicitó cambios. Revisa sus comentarios.`,
    link: `/revisiones/${deliverableId}`,
    actorId: session.id,
  });
  // ── Tareas del flujo ── (paridad con el enlace público /review/[token]): la decisión del
  // cliente completa las tareas abiertas del ciclo; si pidió cambios, crea la tarea REAL
  // «Corregir … (cambios del cliente)» con plazo por defecto de 24 horas hábiles — el
  // cliente no fija plazos: el productor puede ajustarlo luego en la tarea.
  const flowInfo = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: {
      ownerId: true,
      reviewExpiresAt: true,
      project: { select: { leadId: true } },
      versions: { orderBy: { number: "desc" }, take: 1, select: { uploadedById: true, number: true } },
    },
  });
  await closeDeliverableAutoTasks(deliverableId, approved ? ["deliver", "review", "fix"] : ["deliver", "review"]);
  if (!approved && flowInfo) {
    const fixDueAt = defaultFixDeadline(new Date());
    await db.deliverable.update({ where: { id: deliverableId }, data: { fixDueAt } });
    await createDeliverableAutoTask({
      projectId: deliverable.projectId,
      deliverableId,
      title: autoTaskTitles.fix(deliverable.name, latestApproved.number, true),
      description: `El cliente (${session.name}) solicitó cambios${note ? `: ${note.trim().slice(0, 300)}` : ""}. Sus comentarios están en el entregable. Al subir la nueva versión, esta tarea se completa sola. Plazo: ${formatBogota(fixDueAt)} (después de esa hora queda como incumplida).`,
      assigneeId: flowInfo.versions[0]?.uploadedById ?? flowInfo.ownerId ?? flowInfo.project.leadId,
      dueAt: fixDueAt,
      actorId: null,
    });
  }
  refresh(deliverable.projectId);
}

// ─────────────────────────────────────────────
// Tareas 2.0 · Fase 1 — quick-add en lenguaje natural, posponer, dependencias
// ─────────────────────────────────────────────

const normTxt = (x: string) => x.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Crea una tarea desde UN renglón («Grabar dron mañana 9am @Zahid #rodaje 2h»). Sin proyecto =
// tarea personal (misma semántica de createMyTask); con proyecto exige crear_tareas ahí. El
// @persona se resuelve por prefijo contra el equipo activo (nunca usuarios del portal cliente);
// la !prioridad contra el catálogo. Sin fecha en el texto → hoy (toda tarea lleva fechas).
export async function quickAddTask(
  rawText: string,
  projectId?: string | null,
): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado." };
  const text = rawText.trim().slice(0, 300);
  if (!text) return { ok: false, error: "Escribe la tarea." };
  const parsed = parseTaskText(text, Date.now());
  if (!parsed.title) return { ok: false, error: "Falta el título (los tokens solos no bastan)." };

  let pid: string | null = null;
  if (projectId) {
    try {
      await ensureProjectAccess(projectId, "crear_tareas");
    } catch {
      return { ok: false, error: "No puedes crear tareas en este proyecto." };
    }
    pid = projectId;
  }

  // Responsable: @query por prefijo de nombre (o primera palabra del nombre). El portal
  // cliente solo se asigna a sí mismo, como en createMyTask.
  let assigneeId = session.id;
  if (parsed.assigneeQuery && session.role !== "cliente") {
    const q = normTxt(parsed.assigneeQuery);
    const users = await db.user.findMany({
      where: { active: true, isSystemBot: false, role: { isNot: { key: "cliente" } } },
      select: { id: true, name: true },
    });
    const hit =
      users.find((u) => normTxt(u.name).startsWith(q)) ??
      users.find((u) => normTxt(u.name).split(/\s+/).some((w) => w.startsWith(q)));
    if (!hit) return { ok: false, error: `No encuentro a «@${parsed.assigneeQuery}» en el equipo.` };
    assigneeId = hit.id;
  }

  // Prioridad contra el catálogo (por etiqueta o clave); «urgente» cae a la más alta.
  let priority = "MEDIA";
  if (parsed.priorityQuery) {
    const { priorities } = await getTaskLabels();
    const q = normTxt(parsed.priorityQuery);
    const hit =
      priorities.find((x) => normTxt(x.label).startsWith(q) || x.key.toLowerCase().startsWith(q)) ??
      (q === "urgente" ? priorities.find((x) => x.key === "ALTA") : undefined);
    if (hit) priority = hit.key;
  }

  const dueDate = parsed.dueYmd ? new Date(`${parsed.dueYmd}T12:00:00.000Z`) : bogotaNoon();
  const position = pid ? await db.task.count({ where: { projectId: pid } }) : 0;
  const task = await db.task.create({
    data: {
      title: parsed.title,
      priority: priority as never,
      startDate: bogotaNoon(),
      dueDate,
      dueTime: parsed.dueTime,
      estimatedMinutes: parsed.estimatedMinutes,
      assigneeId,
      ownerId: session.id,
      assignedById: assigneeId !== session.id ? session.id : null,
      projectId: pid,
      position,
      ...(parsed.tags.length ? { tags: { create: parsed.tags.map((label) => ({ label })) } } : {}),
    },
  });
  if (assigneeId !== session.id) {
    await notifyAndEmail(assigneeId, {
      type: "task",
      event: "task_assigned",
      title: `Nueva tarea: ${parsed.title}`,
      body: pid ? "Te la asignaron desde el proyecto." : "Te la asignaron desde Mis tareas.",
      link: pid ? `/proyectos/${pid}?tab=tareas` : "/mis-tareas",
      actorId: session.id,
    }).catch(() => null);
  }
  await logActivity({ action: "task.create", summary: `creó la tarea «${parsed.title}»`, projectId: pid, entityType: "task", entityId: task.id });
  revalidatePath("/mis-tareas");
  if (pid) refresh(pid);
  return { ok: true, taskId: task.id };
}

// Pospone una tarea con un gesto: esta tarde (hoy 3pm/6pm), mañana o el próximo lunes
// (conserva la hora salvo «tarde»). Solo responsable/dueño/admin — es un gesto personal.
export async function postponeTask(
  taskId: string,
  when: "tarde" | "manana" | "lunes",
): Promise<{ ok: boolean; error?: string; label?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado." };
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { title: true, assigneeId: true, ownerId: true, projectId: true, dueTime: true, completedAt: true },
  });
  if (!task) return { ok: false, error: "La tarea no existe." };
  if (task.completedAt) return { ok: false, error: "Ya está completada." };
  if (task.assigneeId !== session.id && task.ownerId !== session.id && session.role !== "admin") {
    return { ok: false, error: "Solo el responsable puede posponerla." };
  }
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  const hourNow = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", hour12: false }).format(new Date()));
  let ymd = todayYmd;
  let dueTime = task.dueTime;
  let label = "";
  if (when === "tarde") {
    dueTime = hourNow < 15 ? "15:00" : "18:00";
    label = `hoy ${dueTime}`;
  } else if (when === "manana") {
    ymd = ymdPlus(todayYmd, 1);
    label = "mañana";
  } else {
    const wd = new Date(`${todayYmd}T12:00:00.000Z`).getUTCDay(); // 0=domingo
    ymd = ymdPlus(todayYmd, ((1 - wd + 7) % 7) || 7);
    label = "el lunes";
  }
  await db.task.update({ where: { id: taskId }, data: { dueDate: new Date(`${ymd}T12:00:00.000Z`), dueTime } });
  await logActivity({ action: "task.postpone", summary: `pospuso «${task.title}» para ${label}`, projectId: task.projectId, entityType: "task", entityId: taskId });
  revalidatePath("/mis-tareas");
  if (task.projectId) refresh(task.projectId);
  return { ok: true, label };
}

// ── Dependencias («bloqueada por») ──

// Candidatas a bloqueadora: tareas ABIERTAS del MISMO proyecto (una dependencia entre
// proyectos distintos complica el candado sin aportar; se corta aquí).
export async function getDependencyOptions(taskId: string): Promise<{ id: string; title: string }[]> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { ...taskAccessSelect, projectId: true } });
  try {
    await ensureAccessVia(task, null);
  } catch {
    return [];
  }
  if (!task?.projectId) return [];
  const existing = await db.taskDependency.findMany({ where: { taskId }, select: { blockerId: true } });
  const skip = new Set([taskId, ...existing.map((d) => d.blockerId)]);
  const rows = await db.task.findMany({
    where: { projectId: task.projectId, completedAt: null },
    orderBy: { position: "asc" },
    select: { id: true, title: true },
    take: 100,
  });
  return rows.filter((r) => !skip.has(r.id));
}

// Bloqueadoras ACTUALES de una tarea (el editor del panel las pinta y quita).
export async function getTaskDependencies(taskId: string): Promise<{ id: string; title: string; done: boolean }[]> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  try {
    await ensureAccessVia(task, null);
  } catch {
    return [];
  }
  const deps = await db.taskDependency.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    select: { blocker: { select: { id: true, title: true, completedAt: true } } },
  });
  return deps.map((d) => ({ id: d.blocker.id, title: d.blocker.title, done: !!d.blocker.completedAt }));
}

export async function addTaskDependency(taskId: string, blockerId: string): Promise<{ ok: boolean; error?: string }> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { ...taskAccessSelect, projectId: true } });
  try {
    await ensureAccessVia(task);
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  const blocker = await db.task.findUnique({ where: { id: blockerId }, select: { title: true, projectId: true } });
  if (!blocker) return { ok: false, error: "La tarea bloqueadora no existe." };
  if (!task?.projectId || blocker.projectId !== task.projectId) return { ok: false, error: "Deben ser del mismo proyecto." };
  if (await wouldCreateCycle(taskId, blockerId)) return { ok: false, error: "Eso crearía un círculo (A espera a B y B a A)." };
  await db.taskDependency.upsert({
    where: { taskId_blockerId: { taskId, blockerId } },
    create: { taskId, blockerId },
    update: {},
  });
  await logActivity({ action: "task.dependency", summary: `marcó «${task.title}» como bloqueada por «${blocker.title}»`, projectId: task.projectId, entityType: "task", entityId: taskId });
  refresh(task.projectId);
  revalidatePath("/mis-tareas");
  return { ok: true };
}

export async function removeTaskDependency(taskId: string, blockerId: string): Promise<{ ok: boolean; error?: string }> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { ...taskAccessSelect, projectId: true } });
  try {
    await ensureAccessVia(task);
  } catch {
    return { ok: false, error: "No autorizado." };
  }
  await db.taskDependency.deleteMany({ where: { taskId, blockerId } });
  if (task?.projectId) refresh(task.projectId);
  revalidatePath("/mis-tareas");
  return { ok: true };
}
