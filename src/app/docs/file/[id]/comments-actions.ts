"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject, canWriteProject } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";
import { notifyMany } from "@/lib/notify";
import { bogotaNoon } from "@/lib/today";

// Los comentarios que la gente dejó DENTRO del documento, vistos desde fuera del editor.
// La app NO los edita: el archivo manda (marcar uno como resuelto se hace en el propio editor
// de OnlyOffice y el siguiente guardado lo refleja aquí). Lo que sí se puede hacer desde aquí
// es lo que el editor no sabe hacer: convertir un comentario en una TAREA del proyecto.

export type CommentRow = {
  id: string;
  author: string;
  text: string;
  when: string | null;
  resolved: boolean;
  taskId: string | null;
};

const ACCESO = {
  isPrivate: true,
  leadId: true,
  archivedAt: true,
  finishedAt: true,
  members: { select: { userId: true, role: true } },
} as const;

const fmt = (d: Date): string => {
  try {
    return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return d.toISOString();
  }
};

export async function listDocComments(fileId: string): Promise<{ ok: boolean; error?: string; rows?: CommentRow[]; canTask?: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  const file = await db.fileAsset.findUnique({ where: { id: fileId }, select: { project: { select: ACCESO } } });
  if (!file) return { ok: false, error: "El archivo no existe" };
  if (!canAccessProject(file.project, session)) return { ok: false, error: "Sin acceso" };

  const rows = await db.docComment.findMany({
    where: { fileId },
    orderBy: [{ resolved: "asc" }, { at: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: { id: true, author: true, text: true, at: true, createdAt: true, resolved: true, taskId: true },
  });
  return {
    ok: true,
    // El cliente comenta, pero las tareas son del equipo: no se le ofrece crearlas.
    canTask: canWriteProject(file.project, session) && session.role !== "cliente" && session.role !== "demo",
    rows: rows.map((r) => ({
      id: r.id,
      author: r.author,
      text: r.text,
      when: r.at ? fmt(r.at) : fmt(r.createdAt),
      resolved: r.resolved,
      taskId: r.taskId,
    })),
  };
}

// Un comentario se vuelve trabajo: tarea del proyecto, con el documento y el autor dentro.
export async function taskFromDocComment(commentId: string): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  const session = await getSession();
  if (!session || session.role === "demo" || session.role === "cliente") return { ok: false, error: "No autorizado" };

  const c = await db.docComment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      author: true,
      text: true,
      taskId: true,
      fileId: true,
      file: { select: { name: true, projectId: true, project: { select: ACCESO } } },
    },
  });
  if (!c) return { ok: false, error: "Ese comentario ya no existe" };
  if (!canWriteProject(c.file.project, session)) return { ok: false, error: "Sin permiso en este proyecto" };
  if (c.taskId) return { ok: true, taskId: c.taskId }; // ya tenía tarea: no se duplica

  const titulo = c.text.length > 120 ? `${c.text.slice(0, 119)}…` : c.text;
  const position = await db.task.count({ where: { projectId: c.file.projectId } });
  const task = await db.task.create({
    data: {
      title: titulo,
      description: `Comentario de ${c.author} en «${c.file.name}».\n\n${c.text}`,
      priority: "MEDIA",
      startDate: bogotaNoon(),
      dueDate: bogotaNoon(),
      assigneeId: session.id,
      ownerId: session.id,
      projectId: c.file.projectId,
      position,
    },
    select: { id: true },
  });
  await db.docComment.update({ where: { id: c.id }, data: { taskId: task.id } });

  await logActivity({
    action: "task.create",
    summary: `creó una tarea desde un comentario de «${c.file.name}»`,
    projectId: c.file.projectId,
    entityType: "task",
    entityId: task.id,
  }).catch(() => null);
  // El equipo del proyecto se entera de que ese comentario ya tiene dueño.
  await notifyMany(
    [c.file.project.leadId, ...c.file.project.members.map((m) => m.userId)],
    {
      type: "doc_comment",
      event: "doc_comment",
      actorId: session.id,
      title: `Tarea nueva desde «${c.file.name}»`,
      body: titulo,
      link: `/proyectos/${c.file.projectId}?tab=tareas`,
      projectId: c.file.projectId,
      groupKey: `doc:${c.fileId}`,
    },
  ).catch(() => null);

  revalidatePath(`/proyectos/${c.file.projectId}`);
  return { ok: true, taskId: task.id };
}
