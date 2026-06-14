"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject, canManageProject } from "@/lib/project-access";
import { safeExternalUrl } from "@/lib/url";
import { saveBuffer, mimeFor } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import { notifyAndEmail } from "@/lib/notify";
import { TASK_STATUS } from "@/lib/ui";
import type { SessionUser } from "@/lib/session";

function refresh(projectId: string | null) {
  if (projectId) revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/mis-tareas");
  revalidatePath("/");
}

const statusLabel = (s: string) => (TASK_STATUS as Record<string, { label: string }>)[s]?.label ?? s;

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
} as const;

// Verifica acceso a un proyecto por id. Lanza si no hay acceso. Devuelve la sesión.
async function ensureProjectAccess(projectId: string): Promise<SessionUser> {
  const session = await getSession();
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project || !canAccessProject(project, session)) throw new Error("No autorizado");
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
    if (!canAccessProject(resource.project, session)) throw new Error("No autorizado");
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
  const session = await getSession();
  const count = await db.task.count({ where: { projectId } });
  const task = await db.task.create({
    data: {
      projectId,
      title,
      assigneeId,
      priority: priority as never,
      stage,
      position: count,
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
  const raw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = raw ? new Date(`${raw}T12:00:00.000Z`) : null;
  await db.task.update({ where: { id: taskId }, data: { dueDate } });
  const session = await getSession();
  if (task!.assigneeId && task!.assigneeId !== session?.id) {
    await notifyAndEmail(task!.assigneeId, {
      type: "task",
      title: `Fecha de entrega de «${task!.title}»`,
      body: raw ? `Nueva fecha de entrega: ${raw}` : "Se quitó la fecha de entrega.",
      link: projectId ? `/proyectos/${projectId}?tab=tareas` : "/mis-tareas",
    });
  }
  await logActivity({ action: "task.dueDate", summary: raw ? `fijó la entrega de «${task!.title}» el ${raw}` : `quitó la entrega de «${task!.title}»`, projectId, entityType: "task", entityId: taskId });
  refresh(projectId);
}

export async function setTaskStatus(taskId: string, _projectId: string, status: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  await db.task.update({ where: { id: taskId }, data: { status: status as never } });
  await logActivity({
    action: "task.status",
    summary: `cambió el estado de «${task!.title}» a ${statusLabel(status)}`,
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
  await db.task.update({ where: { id: taskId }, data: { stage: stage || null } });
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
  await logActivity({
    action: "task.shootDate",
    summary: raw ? `fijó el rodaje de «${task!.title}» el ${raw}` : `quitó la fecha de rodaje de «${task!.title}»`,
    projectId,
    entityType: "task",
    entityId: taskId,
  });
  refresh(projectId);
}

export async function deleteTask(taskId: string, _projectId: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: taskAccessSelect });
  const projectId = await ensureAccessVia(task);
  await db.task.delete({ where: { id: taskId } });
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

// ── Entregables ──
export async function createDeliverable(projectId: string, formData: FormData) {
  await ensureProjectAccess(projectId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const type = String(formData.get("type") ?? "REEL");
  const d = await db.deliverable.create({ data: { projectId, name, type: type as never } });
  await logActivity({ action: "deliverable.create", summary: `creó el entregable «${name}»`, projectId, entityType: "deliverable", entityId: d.id });
  refresh(projectId);
}

export async function setDeliverableStatus(id: string, _projectId: string, status: string) {
  const deliverable = await db.deliverable.findUnique({ where: { id }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(deliverable);
  await db.deliverable.update({ where: { id }, data: { status: status as never } });
  await logActivity({ action: "deliverable.status", summary: `cambió el estado del entregable «${deliverable!.name}» a ${statusLabel(status)}`, projectId, entityType: "deliverable", entityId: id });
  refresh(projectId);
}

export async function addDeliverableVersion(
  deliverableId: string,
  _projectId: string,
  formData: FormData,
) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { name: true, projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canAccessProject(deliverable.project, session)) throw new Error("No autorizado");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const fileUrl = safeExternalUrl(String(formData.get("fileUrl") ?? ""));
  const last = await db.deliverableVersion.findFirst({
    where: { deliverableId },
    orderBy: { number: "desc" },
  });
  const number = (last?.number ?? 0) + 1;
  await db.deliverableVersion.create({
    data: {
      deliverableId,
      number,
      notes,
      fileUrl,
      uploadedById: session!.id,
    },
  });
  await logActivity({ action: "deliverable.version", summary: `subió la versión v${number} de «${deliverable.name}»`, projectId: deliverable.projectId, entityType: "deliverable", entityId: deliverableId });
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
export async function uploadProjectFiles(projectId: string, formData: FormData) {
  const session = await ensureProjectAccess(projectId);
  const folderId = String(formData.get("folderId") ?? "") || null;
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
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
    const rel = await saveBuffer(`project/${projectId}`, `${asset.id}-${file.name}`, buf);
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
  // skipDuplicates por @@unique(projectId,name): si ya existe, no rompe.
  const existing = await db.projectFolder.findFirst({ where: { projectId, name } });
  if (existing) return;
  await db.projectFolder.create({ data: { projectId, name, icon, color, position: count } });
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
