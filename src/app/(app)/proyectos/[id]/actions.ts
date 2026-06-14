"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject, canManageProject } from "@/lib/project-access";
import { safeExternalUrl } from "@/lib/url";
import type { SessionUser } from "@/lib/session";

function refresh(projectId: string) {
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/mis-tareas");
  revalidatePath("/");
}

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
// confía en el projectId que manda el cliente) y verifica acceso a ese proyecto.
type WithProject = { projectId: string; project: { isPrivate: boolean; leadId: string | null; members: { userId: string; role: string }[] } } | null;
async function ensureAccessVia(resource: WithProject): Promise<string> {
  const session = await getSession();
  if (!resource || !canAccessProject(resource.project, session)) throw new Error("No autorizado");
  return resource.projectId;
}

// ── Tareas ──
export async function createTask(projectId: string, formData: FormData) {
  await ensureProjectAccess(projectId);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const assigneeId = String(formData.get("assigneeId") ?? "") || null;
  const priority = String(formData.get("priority") ?? "MEDIA");
  const count = await db.task.count({ where: { projectId } });
  await db.task.create({
    data: { projectId, title, assigneeId, priority: priority as never, position: count },
  });
  refresh(projectId);
}

export async function setTaskStatus(taskId: string, _projectId: string, status: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(task);
  await db.task.update({ where: { id: taskId }, data: { status: status as never } });
  refresh(projectId);
}

export async function deleteTask(taskId: string, _projectId: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(task);
  await db.task.delete({ where: { id: taskId } });
  refresh(projectId);
}

export async function toggleChecklistItem(itemId: string, _projectId: string, done: boolean) {
  const item = await db.checklistItem.findUnique({
    where: { id: itemId },
    select: { task: { select: { projectId: true, project: { select: accessSelect } } } },
  });
  const projectId = await ensureAccessVia(item?.task ?? null);
  await db.checklistItem.update({ where: { id: itemId }, data: { done } });
  refresh(projectId);
}

export async function addChecklistItem(taskId: string, _projectId: string, formData: FormData) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(task);
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;
  const count = await db.checklistItem.count({ where: { taskId } });
  await db.checklistItem.create({ data: { taskId, label, position: count } });
  refresh(projectId);
}

// ── Entregables ──
export async function createDeliverable(projectId: string, formData: FormData) {
  await ensureProjectAccess(projectId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const type = String(formData.get("type") ?? "REEL");
  await db.deliverable.create({ data: { projectId, name, type: type as never } });
  refresh(projectId);
}

export async function setDeliverableStatus(id: string, _projectId: string, status: string) {
  const deliverable = await db.deliverable.findUnique({ where: { id }, select: { projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(deliverable);
  await db.deliverable.update({ where: { id }, data: { status: status as never } });
  refresh(projectId);
}

export async function addDeliverableVersion(
  deliverableId: string,
  _projectId: string,
  formData: FormData,
) {
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { projectId: true, project: { select: accessSelect } } });
  const session = await getSession();
  if (!deliverable || !canAccessProject(deliverable.project, session)) throw new Error("No autorizado");
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const fileUrl = safeExternalUrl(String(formData.get("fileUrl") ?? ""));
  const last = await db.deliverableVersion.findFirst({
    where: { deliverableId },
    orderBy: { number: "desc" },
  });
  await db.deliverableVersion.create({
    data: {
      deliverableId,
      number: (last?.number ?? 0) + 1,
      notes,
      fileUrl,
      uploadedById: session!.id,
    },
  });
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
  await db.fileAsset.create({
    data: { projectId, name, url, folderId, kind, uploadedById: session.id },
  });
  refresh(projectId);
}

export async function deleteFile(fileId: string, _projectId: string) {
  const file = await db.fileAsset.findUnique({ where: { id: fileId }, select: { projectId: true, project: { select: accessSelect } } });
  const projectId = await ensureAccessVia(file);
  await db.fileAsset.delete({ where: { id: fileId } });
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
  refresh(projectId);
}

export async function removeProjectMember(projectId: string, userId: string) {
  await ensureProjectManage(projectId);
  await db.projectMember
    .delete({ where: { projectId_userId: { projectId, userId } } })
    .catch((e: { code?: string }) => {
      if (e?.code !== "P2025") throw e; // P2025 = no existe → ignorar; el resto propaga
    });
  refresh(projectId);
}
