"use server";

// Cronómetro de tareas (Tareas 2.0, Fase 1): UN reloj por usuario (RunningTimer, PK userId).
// ▶ Empezar sobre otra tarea PARA el reloj anterior primero (materializa su TimeEntry) — nunca
// hay dos corriendo. ⏹ Parar convierte el tiempo en un TimeEntry del parte de horas (mínimo
// 1 minuto, redondeado al minuto) anclado al día Bogotá de HOY, igual que logTime.

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { revalidatePath } from "next/cache";
import { getTaskLabels } from "@/lib/workflow-labels";

export type RunningTimerInfo = { taskId: string; taskTitle: string; projectId: string | null; startedAtIso: string };

function bogotaTodayNoonUTC(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  return new Date(`${ymd}T12:00:00.000Z`);
}

// ¿Puede esta persona cronometrar la tarea? Responsable, dueño o admin — el reloj imputa horas
// PROPIAS (el TimeEntry queda a nombre de quien lo corre), así que no exige gestionar nada.
async function timerTask(taskId: string, userId: string, isAdmin: boolean) {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, projectId: true, assigneeId: true, ownerId: true, completedAt: true, status: true },
  });
  if (!task) return null;
  if (task.assigneeId !== userId && task.ownerId !== userId && !isAdmin) return null;
  return task;
}

// Cierra el reloj VIGENTE del usuario (si hay) creando su TimeEntry. Devuelve los minutos.
async function settleRunning(userId: string): Promise<{ minutes: number; taskTitle: string; projectId: string | null } | null> {
  const timer = await db.runningTimer.findUnique({
    where: { userId },
    select: { taskId: true, startedAt: true, task: { select: { title: true, projectId: true } } },
  });
  if (!timer) return null;
  const minutes = Math.max(1, Math.round((Date.now() - timer.startedAt.getTime()) / 60_000));
  await db.timeEntry.create({
    data: { taskId: timer.taskId, userId, minutes, note: "Cronómetro", spentOn: bogotaTodayNoonUTC() },
  });
  await db.runningTimer.delete({ where: { userId } }).catch(() => null);
  return { minutes, taskTitle: timer.task.title, projectId: timer.task.projectId };
}

export async function startTaskTimer(taskId: string): Promise<{ ok: boolean; error?: string; switchedFrom?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado." };
  const task = await timerTask(taskId, session.id, session.role === "admin");
  if (!task) return { ok: false, error: "Solo el responsable o el dueño pueden cronometrarla." };
  if (task.completedAt) return { ok: false, error: "Ya está completada." };
  const prev = await settleRunning(session.id); // un solo reloj: el anterior queda anotado
  await db.runningTimer.create({ data: { userId: session.id, taskId } });
  // Estado que REACCIONA (Fase 2): si la tarea seguía en el PRIMER estado del catálogo (recién
  // creada), empezar a trabajarla la avanza al siguiente estado abierto — sin ceremonia.
  try {
    const { statuses } = await getTaskLabels();
    const next = statuses.find((x, i) => i > 0 && !x.isDone);
    if (statuses[0] && next && task.status === statuses[0].key) {
      await db.task.update({ where: { id: taskId }, data: { status: next.key as never } });
    }
  } catch { /* cosmético: el reloj ya arrancó */ }
  revalidatePath("/mis-tareas");
  if (task.projectId) revalidatePath(`/proyectos/${task.projectId}`);
  return { ok: true, switchedFrom: prev?.taskTitle };
}

export async function stopTaskTimer(): Promise<{ ok: boolean; error?: string; minutes?: number; taskTitle?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado." };
  const settled = await settleRunning(session.id);
  if (!settled) return { ok: false, error: "No hay cronómetro corriendo." };
  await logActivity({
    action: "task.time",
    summary: `registró ${settled.minutes} min por cronómetro en «${settled.taskTitle}»`,
    projectId: settled.projectId,
    entityType: "task",
  }).catch(() => null);
  revalidatePath("/mis-tareas");
  if (settled.projectId) revalidatePath(`/proyectos/${settled.projectId}`);
  return { ok: true, minutes: settled.minutes, taskTitle: settled.taskTitle };
}

// Estado del reloj (para pintar «grabando 0:42» al montar o tras navegar).
export async function getMyRunningTimer(): Promise<RunningTimerInfo | null> {
  const session = await getSession();
  if (!session) return null;
  const t = await db.runningTimer.findUnique({
    where: { userId: session.id },
    select: { taskId: true, startedAt: true, task: { select: { title: true, projectId: true } } },
  });
  if (!t) return null;
  return { taskId: t.taskId, taskTitle: t.task.title, projectId: t.task.projectId, startedAtIso: t.startedAt.toISOString() };
}
