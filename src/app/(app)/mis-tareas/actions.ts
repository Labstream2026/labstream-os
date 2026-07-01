"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notifyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { getTaskLabels } from "@/lib/workflow-labels";
import { completionTransition } from "@/lib/task-completion";
import { bogotaNoon } from "@/lib/today";

// Marcar una tarea como terminada (desde el dock o Mis tareas). Solo el responsable
// o el dueño pueden. Usa el estado configurado como "Terminada" (isDone) y deja la
// marca de cuándo se completó (completedAt) + registro en actividad.
export async function completeMyTask(taskId: string) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const task = await db.task.findUnique({ where: { id: taskId }, select: { title: true, assigneeId: true, ownerId: true, projectId: true, completedAt: true } });
  if (!task) return;
  if (task.assigneeId !== session.id && task.ownerId !== session.id) throw new Error("No autorizado");
  const { statuses } = await getTaskLabels();
  const done = statuses.find((s) => s.isDone) ?? statuses[statuses.length - 1];
  if (!done) return;
  const { completedAt, justCompleted } = await completionTransition(done.key, task.completedAt);
  await db.task.update({ where: { id: taskId }, data: { status: done.key as never, completedAt } });
  if (justCompleted) {
    await logActivity({ action: "task.complete", summary: `completó la tarea «${task.title}»`, projectId: task.projectId, entityType: "task", entityId: taskId });
  }
  revalidatePath("/mis-tareas");
  revalidatePath("/");
  if (task.projectId) revalidatePath(`/proyectos/${task.projectId}`);
}

// "Mi día": añade/quita una tarea del listado de enfoque PERSONAL del usuario. Solo tareas
// donde es responsable o dueño (las que ya ve en Mis tareas). Devuelve el estado resultante
// para que el botón ⭐ haga actualización optimista.
export async function toggleMyDay(taskId: string): Promise<{ ok: boolean; inMyDay: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false, inMyDay: false };
  const task = await db.task.findUnique({ where: { id: taskId }, select: { assigneeId: true, ownerId: true } });
  if (!task) return { ok: false, inMyDay: false };
  if (task.assigneeId !== session.id && task.ownerId !== session.id && session.role !== "admin") return { ok: false, inMyDay: false };
  const existing = await db.myDayItem.findUnique({ where: { userId_taskId: { userId: session.id, taskId } }, select: { id: true } });
  if (existing) {
    await db.myDayItem.delete({ where: { id: existing.id } });
    revalidatePath("/mis-tareas");
    return { ok: true, inMyDay: false };
  }
  const last = await db.myDayItem.findFirst({ where: { userId: session.id }, orderBy: { position: "desc" }, select: { position: true } });
  await db.myDayItem.create({ data: { userId: session.id, taskId, position: (last?.position ?? 0) + 1 } });
  revalidatePath("/mis-tareas");
  return { ok: true, inMyDay: true };
}

// Vacía "Mi día" del usuario (no borra tareas; solo limpia el plan de enfoque de hoy).
export async function clearMyDay() {
  const session = await getSession();
  if (!session) return;
  await db.myDayItem.deleteMany({ where: { userId: session.id } });
  revalidatePath("/mis-tareas");
}

// Crear una tarea personal o asignada a alguien (sin proyecto).
// - Sin responsable o asignada a mí → tarea personal mía.
// - Privada → solo la vemos su dueño y su responsable.
export async function createMyTask(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  let assigneeId = String(formData.get("assigneeId") ?? "") || session.id;
  const priority = String(formData.get("priority") ?? "MEDIA");
  const isPrivate = formData.get("isPrivate") === "on" || formData.get("isPrivate") === "true";
  // Toda tarea lleva inicio y fin: el formulario los exige. Si no llegan (automatismos/API),
  // por defecto hoy, para que nunca queden vacíos.
  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueRaw ? new Date(`${dueRaw}T12:00:00.000Z`) : bogotaNoon();
  const startRaw = String(formData.get("startDate") ?? "").trim();
  const startDate = startRaw ? new Date(`${startRaw}T12:00:00.000Z`) : bogotaNoon();
  const description = String(formData.get("description") ?? "").trim() || null;

  // El PORTAL CLIENTE solo se crea tareas personales para SÍ MISMO (no asigna a otros). Para el
  // resto, el responsable debe existir, estar activo y NO ser un usuario del portal cliente.
  if (session.role === "cliente") {
    assigneeId = session.id;
  } else if (assigneeId !== session.id) {
    const target = await db.user.findUnique({ where: { id: assigneeId }, select: { active: true, role: { select: { key: true } } } });
    if (!target?.active || target.role?.key === "cliente") throw new Error("Usuario inválido");
  }

  const task = await db.task.create({
    data: {
      title,
      description,
      assigneeId,
      ownerId: session.id,
      assignedById: assigneeId !== session.id ? session.id : null,
      priority: priority as never,
      startDate,
      dueDate,
      isPrivate,
      projectId: null,
    },
  });

  if (assigneeId !== session.id) {
    await notifyAndEmail(assigneeId, {
      type: "task",
      event: "task_assigned",
      title: `Nueva tarea: ${title}`,
      body: `${session.name} te asignó una tarea${dueRaw ? ` (entrega ${dueRaw})` : ""}.`,
      link: "/mis-tareas",
      actorId: session.id,
    });
    await logActivity({ action: "task.create", summary: `asignó la tarea «${title}»`, entityType: "task", entityId: task.id });
  }
  revalidatePath("/mis-tareas");
  revalidatePath("/");
}
