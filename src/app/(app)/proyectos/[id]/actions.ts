"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

function refresh(projectId: string) {
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/mis-tareas");
  revalidatePath("/");
}

// ── Tareas ──
export async function createTask(projectId: string, formData: FormData) {
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

export async function setTaskStatus(taskId: string, projectId: string, status: string) {
  await db.task.update({ where: { id: taskId }, data: { status: status as never } });
  refresh(projectId);
}

export async function deleteTask(taskId: string, projectId: string) {
  await db.task.delete({ where: { id: taskId } });
  refresh(projectId);
}

export async function toggleChecklistItem(itemId: string, projectId: string, done: boolean) {
  await db.checklistItem.update({ where: { id: itemId }, data: { done } });
  refresh(projectId);
}

export async function addChecklistItem(taskId: string, projectId: string, formData: FormData) {
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;
  const count = await db.checklistItem.count({ where: { taskId } });
  await db.checklistItem.create({ data: { taskId, label, position: count } });
  refresh(projectId);
}

// ── Entregables ──
export async function createDeliverable(projectId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const type = String(formData.get("type") ?? "REEL");
  await db.deliverable.create({ data: { projectId, name, type: type as never } });
  refresh(projectId);
}

export async function setDeliverableStatus(id: string, projectId: string, status: string) {
  await db.deliverable.update({ where: { id }, data: { status: status as never } });
  refresh(projectId);
}

export async function addDeliverableVersion(
  deliverableId: string,
  projectId: string,
  formData: FormData,
) {
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const fileUrl = String(formData.get("fileUrl") ?? "").trim() || null;
  const user = await getCurrentUser();
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
      uploadedById: user?.id ?? null,
    },
  });
  refresh(projectId);
}

// ── Archivos ──
export async function addFile(projectId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  if (!name || !url) return;
  const folderId = String(formData.get("folderId") ?? "") || null;
  const kind = url.includes("drive.google.com") ? "DRIVE" : "LINK";
  const user = await getCurrentUser();
  await db.fileAsset.create({
    data: { projectId, name, url, folderId, kind, uploadedById: user?.id ?? null },
  });
  refresh(projectId);
}

export async function deleteFile(fileId: string, projectId: string) {
  await db.fileAsset.delete({ where: { id: fileId } });
  refresh(projectId);
}
