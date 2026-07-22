import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

// Detector de tareas ESTANCADAS (Tareas 2.0, Fase 2): una tarea abierta que lleva STALE_DAYS
// sin tocarse (updatedAt como proxy honesto de actividad) genera UN aviso al líder del proyecto
// (o al responsable si no hay líder). Auto-rearme: si la tarea vuelve a moverse después del
// aviso, la marca se limpia sola y podrá re-avisar tras otra racha quieta — nunca spam.
// Se cuelga de los mismos disparos que los demás barridos (campana + crons), con su throttle.
const STALE_DAYS = 7;
const SWEEP_THROTTLE_MS = 6 * 60 * 60_000; // 6 h: la estancación se mide en días
let lastSweepAt = 0;

export async function sweepStaleTasks(opts?: { force?: boolean }): Promise<{ notified: number } | null> {
  if (!opts?.force && Date.now() - lastSweepAt < SWEEP_THROTTLE_MS) return null;
  lastSweepAt = Date.now();
  const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000);

  // 1) RE-ARME: avisadas cuya última actividad es RECIENTE (> corte) quedan listas para
  //    vigilarse de nuevo. Nota: escribir la marca también toca updatedAt (@updatedAt), así
  //    que una tarea que SIGUE quieta se re-arma y vuelve a avisar ~cada STALE_DAYS — un
  //    recordatorio semanal al líder mientras nadie la mueva, no un aviso único.
  await db.task.updateMany({
    where: { staleNotifiedAt: { not: null }, completedAt: null, updatedAt: { gt: cutoff } },
    data: { staleNotifiedAt: null },
  }).catch(() => null);

  // 2) NUEVAS estancadas: abiertas, quietas, con responsable, en proyecto VIVO (o personales),
  //    sin aviso previo vigente. Lote acotado: el resto cae en el siguiente barrido.
  const stale = await db.task.findMany({
    where: {
      completedAt: null,
      staleNotifiedAt: null,
      updatedAt: { lte: cutoff },
      assigneeId: { not: null },
      OR: [{ projectId: null }, { project: { archivedAt: null, finishedAt: null } }],
    },
    orderBy: { updatedAt: "asc" },
    take: 20,
    select: {
      id: true, title: true, status: true, assigneeId: true, updatedAt: true,
      project: { select: { id: true, name: true, leadId: true } },
    },
  });

  let notified = 0;
  const now = new Date();
  for (const t of stale) {
    const days = Math.floor((now.getTime() - t.updatedAt.getTime()) / 86_400_000);
    // Reclamo atómico (varios procesos barren): solo avisa quien logre poner la marca primero.
    const claimed = await db.task.updateMany({
      where: { id: t.id, staleNotifiedAt: null },
      data: { staleNotifiedAt: now },
    });
    if (claimed.count !== 1) continue;
    const recipient = t.project?.leadId ?? t.assigneeId!;
    await notify(recipient, {
      type: "task",
      event: "task_stale",
      title: `Estancada: «${t.title}»`,
      body: `Lleva ${days} días sin moverse${t.project ? ` en ${t.project.name}` : ""}. ¿Sigue viva, se repone o se cierra?`,
      link: t.project ? `/proyectos/${t.project.id}?tab=tareas` : "/mis-tareas",
      subjectId: t.assigneeId ?? undefined,
    }).catch(() => null);
    notified++;
  }
  return { notified };
}
