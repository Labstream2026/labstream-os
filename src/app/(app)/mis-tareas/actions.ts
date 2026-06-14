"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notifyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";

// Crear una tarea personal o asignada a alguien (sin proyecto).
// - Sin responsable o asignada a mí → tarea personal mía.
// - Privada → solo la vemos su dueño y su responsable.
export async function createMyTask(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const assigneeId = String(formData.get("assigneeId") ?? "") || session.id;
  const priority = String(formData.get("priority") ?? "MEDIA");
  const isPrivate = formData.get("isPrivate") === "on" || formData.get("isPrivate") === "true";
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueRaw ? new Date(`${dueRaw}T12:00:00.000Z`) : null;

  if (assigneeId !== session.id) {
    const target = await db.user.findUnique({ where: { id: assigneeId }, select: { active: true } });
    if (!target?.active) throw new Error("Usuario inválido");
  }

  const task = await db.task.create({
    data: {
      title,
      assigneeId,
      ownerId: session.id,
      assignedById: assigneeId !== session.id ? session.id : null,
      priority: priority as never,
      dueDate,
      isPrivate,
      projectId: null,
    },
  });

  if (assigneeId !== session.id) {
    await notifyAndEmail(assigneeId, {
      type: "task",
      title: `Nueva tarea: ${title}`,
      body: `${session.name} te asignó una tarea${dueRaw ? ` (entrega ${dueRaw})` : ""}.`,
      link: "/mis-tareas",
    });
    await logActivity({ action: "task.create", summary: `asignó la tarea «${title}»`, entityType: "task", entityId: task.id });
  }
  revalidatePath("/mis-tareas");
  revalidatePath("/");
}
