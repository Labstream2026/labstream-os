import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getTaskLabels } from "@/lib/workflow-labels";

// ── Tareas automáticas del ciclo de revisión de entregables ──
// Cada paso del flujo crea/cierra TAREAS reales en el tablero del proyecto (en la fase
// "Postproducción" si el proyecto la tiene), para que el trabajo pendiente nunca quede
// solo en una notificación:
//   · subir versión            → tarea «Pre-aprobar …» al responsable de la revisión
//                                (con la caducidad del enlace como fecha límite) y cierra
//                                las «Corregir …» abiertas (la corrección ya se hizo).
//   · pre-aprobación: cambios  → cierra «Pre-aprobar …» y crea «Corregir …» a quien subió.
//   · pre-aprobación: aprobado → cierra «Pre-aprobar …» y crea «Entregar al cliente …».
//   · decisión del cliente     → cierra «Entregar al cliente …»; si pidió cambios, crea
//                                «Corregir … (cambios del cliente)».
// Las tareas automáticas se reconocen por su PREFIJO de título + deliverableId (sin
// migración). Si alguien renombra una, simplemente deja de auto-cerrarse: sigue siendo
// una tarea normal del tablero.

export const AUTO_TASK_PREFIX = {
  review: "Pre-aprobar",
  fix: "Corregir",
  deliver: "Entregar al cliente",
} as const;

export type AutoTaskKind = keyof typeof AUTO_TASK_PREFIX;

// Títulos canónicos (el prefijo es lo que permite encontrarlas para cerrarlas).
export const autoTaskTitles = {
  review: (name: string, v: number) => `${AUTO_TASK_PREFIX.review} «${name}» · v${v}`,
  fix: (name: string, v: number | null, fromClient = false) =>
    `${AUTO_TASK_PREFIX.fix} «${name}»${v ? ` · v${v}` : ""}${fromClient ? " (cambios del cliente)" : ""}`,
  deliver: (name: string, v: number) => `${AUTO_TASK_PREFIX.deliver} «${name}» (v${v} pre-aprobada)`,
};

// Misma fórmula que recalcProjectProgress de las acciones del proyecto: % de tareas con
// completedAt. Se replica aquí porque estas tareas también mueven la barra de progreso.
// (Exportada: el barrido de SLA de entregables también cierra tareas.)
export async function recalcProgress(projectId: string) {
  const [total, done] = await Promise.all([
    db.task.count({ where: { projectId } }),
    db.task.count({ where: { projectId, completedAt: { not: null } } }),
  ]);
  await db.project.update({
    where: { id: projectId },
    data: { progress: total ? Math.round((done / total) * 100) : 0 },
  });
  revalidatePath("/proyectos");
}

// Fase del tablero donde viven estas tareas: "Postproducción" si el proyecto la tiene
// (viene en las fases por defecto); si no, la fase de edición; en último caso la primera
// columna (stage null).
async function postproStage(projectId: string): Promise<string | null> {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { stages: true } });
  if (!p) return null;
  return (
    p.stages.find((s) => /post\s*producci/i.test(s)) ??
    p.stages.find((s) => /edici/i.test(s)) ??
    null
  );
}

// Cierra (marca como hechas) las tareas automáticas ABIERTAS del entregable cuyos títulos
// empiecen por los prefijos indicados. Usa el primer estado marcado como "Terminada" del
// catálogo de estados configurables.
// Opciones del flujo con SLA:
//   · assigneeId  — cierra SOLO la del responsable indicado (al solicitar cambios, el
//                   co-revisor que decidió cumple SU tarea; la del otro sigue viva hasta
//                   el límite de pre-aprobación).
//   · breachIfAfter — si el cierre ocurre DESPUÉS de ese plazo, la tarea se completa
//                   igual pero queda marcada con incumplimiento (breachedAt): la
//                   corrección llegó tarde aunque haya llegado.
export async function closeDeliverableAutoTasks(
  deliverableId: string,
  kinds: AutoTaskKind[],
  opts?: { assigneeId?: string | null; breachIfAfter?: Date | null },
): Promise<void> {
  if (!kinds.length) return;
  const open = await db.task.findMany({
    where: {
      deliverableId,
      completedAt: null,
      ...(opts?.assigneeId ? { assigneeId: opts.assigneeId } : {}),
      OR: kinds.map((k) => ({ title: { startsWith: AUTO_TASK_PREFIX[k] } })),
    },
    select: { id: true, projectId: true },
  });
  if (!open.length) return;
  const { statuses } = await getTaskLabels();
  const doneKey = statuses.find((s) => s.isDone)?.key ?? "COMPLETADA";
  const now = new Date();
  const breached = !!opts?.breachIfAfter && now.getTime() > opts.breachIfAfter.getTime();
  await db.task.updateMany({
    where: { id: { in: open.map((t) => t.id) } },
    data: { status: doneKey, completedAt: now, ...(breached ? { breachedAt: now } : {}) },
  });
  const projectId = open.find((t) => t.projectId)?.projectId;
  if (projectId) await recalcProgress(projectId);
}

// Completa las tareas "ítem de entregable" (isDeliverableWork) VINCULADAS al entregable:
// mandar la versión a revisión ES terminar ese trabajo, así que se cierran solas.
export async function completeLinkedWorkTasks(deliverableId: string): Promise<void> {
  const open = await db.task.findMany({
    where: { deliverableId, isDeliverableWork: true, completedAt: null },
    select: { id: true, projectId: true },
  });
  if (!open.length) return;
  const { statuses } = await getTaskLabels();
  const doneKey = statuses.find((s) => s.isDone)?.key ?? "COMPLETADA";
  await db.task.updateMany({
    where: { id: { in: open.map((t) => t.id) } },
    data: { status: doneKey, completedAt: new Date() },
  });
  const projectId = open.find((t) => t.projectId)?.projectId;
  if (projectId) await recalcProgress(projectId);
}

// Fecha+hora de una tarea a partir de un INSTANTE límite: el día se ancla a mediodía UTC
// (convención de dueDate en toda la app) con el día CALENDARIO de Bogotá, y la hora de
// pared va en dueTime. Así "vence hoy 8:00 pm" no se corre al día siguiente por UTC.
const BOGOTA_YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
const BOGOTA_HM = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
export function taskDueFromInstant(at: Date | null | undefined): { dueDate: Date | null; dueTime: string | null } {
  if (!at) return { dueDate: null, dueTime: null };
  return { dueDate: new Date(`${BOGOTA_YMD.format(at)}T12:00:00.000Z`), dueTime: BOGOTA_HM.format(at) };
}

// Crea una tarea automática del flujo (si hay a quién asignarla y no existe ya una
// ABIERTA idéntica para el mismo entregable Y responsable — así reintentos o dobles
// clics no duplican, pero cada co-revisor SÍ recibe su propia tarea «Pre-aprobar…»).
export async function createDeliverableAutoTask(opts: {
  projectId: string;
  deliverableId: string;
  title: string;
  description?: string | null;
  assigneeId: string | null;
  dueAt?: Date | null; // instante límite (se traduce a dueDate + dueTime de Bogotá)
  actorId?: string | null;
}): Promise<void> {
  if (!opts.assigneeId) return;
  const dup = await db.task.findFirst({
    where: { deliverableId: opts.deliverableId, title: opts.title, assigneeId: opts.assigneeId, completedAt: null },
    select: { id: true },
  });
  if (dup) return;
  const { statuses } = await getTaskLabels();
  const openKey = statuses.find((s) => s.isDefault)?.key ?? statuses.find((s) => !s.isDone)?.key ?? "PENDIENTE";
  const { dueDate, dueTime } = taskDueFromInstant(opts.dueAt);
  await db.task.create({
    data: {
      title: opts.title,
      description: opts.description ?? null,
      status: openKey,
      stage: await postproStage(opts.projectId),
      priority: "ALTA",
      dueDate,
      dueTime,
      projectId: opts.projectId,
      deliverableId: opts.deliverableId,
      assigneeId: opts.assigneeId,
      ownerId: opts.actorId ?? null,
      assignedById: opts.actorId ?? null,
    },
  });
  await recalcProgress(opts.projectId);
}

// Crea la tarea «Pre-aprobar …» a CADA revisor del conjunto (cada quien responde por su
// revisión: el flujo de cumplimiento es individual). Devuelve cuántas creó.
export async function createReviewTasksForReviewers(opts: {
  projectId: string;
  deliverableId: string;
  title: string;
  description?: string | null;
  reviewerIds: (string | null)[];
  dueAt?: Date | null;
  actorId?: string | null;
}): Promise<void> {
  const ids = [...new Set(opts.reviewerIds.filter(Boolean) as string[])];
  for (const assigneeId of ids) {
    await createDeliverableAutoTask({ ...opts, assigneeId });
  }
}
