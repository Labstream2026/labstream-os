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
async function recalcProgress(projectId: string) {
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
export async function closeDeliverableAutoTasks(deliverableId: string, kinds: AutoTaskKind[]): Promise<void> {
  if (!kinds.length) return;
  const open = await db.task.findMany({
    where: {
      deliverableId,
      completedAt: null,
      OR: kinds.map((k) => ({ title: { startsWith: AUTO_TASK_PREFIX[k] } })),
    },
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

// Crea una tarea automática del flujo (si hay a quién asignarla y no existe ya una
// ABIERTA idéntica para el mismo entregable — así reintentos o dobles clics no duplican).
export async function createDeliverableAutoTask(opts: {
  projectId: string;
  deliverableId: string;
  title: string;
  description?: string | null;
  assigneeId: string | null;
  dueDate?: Date | null;
  actorId?: string | null;
}): Promise<void> {
  if (!opts.assigneeId) return;
  const dup = await db.task.findFirst({
    where: { deliverableId: opts.deliverableId, title: opts.title, completedAt: null },
    select: { id: true },
  });
  if (dup) return;
  const { statuses } = await getTaskLabels();
  const openKey = statuses.find((s) => s.isDefault)?.key ?? statuses.find((s) => !s.isDone)?.key ?? "PENDIENTE";
  await db.task.create({
    data: {
      title: opts.title,
      description: opts.description ?? null,
      status: openKey,
      stage: await postproStage(opts.projectId),
      priority: "ALTA",
      dueDate: opts.dueDate ?? null,
      projectId: opts.projectId,
      deliverableId: opts.deliverableId,
      assigneeId: opts.assigneeId,
      ownerId: opts.actorId ?? null,
      assignedById: opts.actorId ?? null,
    },
  });
  await recalcProgress(opts.projectId);
}
