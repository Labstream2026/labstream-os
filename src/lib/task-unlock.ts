import { db } from "@/lib/db";
import { notify } from "@/lib/notify";

// Dependencias entre tareas (Tareas 2.0, Fase 1).
// El CANDADO real es server-side: antes de completar una tarea se consultan sus bloqueadoras
// abiertas (openBlockersOf) y se rechaza si queda alguna. Al completarse una tarea,
// handleTaskCompleted desbloquea a las dependientes que ya no esperan a nadie y avisa
// («Te toca») al responsable de cada una.

// Bloqueadoras SIN completar de una tarea (alimenta el candado y el chip 🔒 de la UI).
export async function openBlockersOf(taskId: string): Promise<{ id: string; title: string }[]> {
  const deps = await db.taskDependency.findMany({
    where: { taskId, blocker: { completedAt: null } },
    select: { blocker: { select: { id: true, title: true } } },
    orderBy: { createdAt: "asc" },
  });
  return deps.map((d) => d.blocker);
}

// Reacción al COMPLETAR `taskId`: para cada dependiente abierta cuyo ÚNICO bloqueo pendiente
// era esta, avisa a su responsable. Nunca lanza: un aviso fallido no debe romper el completar.
export async function handleTaskCompleted(taskId: string, actorId: string | null): Promise<void> {
  try {
    const [deps, done] = await Promise.all([
      db.taskDependency.findMany({
        where: { blockerId: taskId },
        select: {
          task: {
            select: {
              id: true, title: true, assigneeId: true, projectId: true, completedAt: true,
              blockedBy: { select: { blocker: { select: { id: true, completedAt: true } } } },
            },
          },
        },
      }),
      db.task.findUnique({ where: { id: taskId }, select: { title: true } }),
    ]);
    for (const d of deps) {
      const t = d.task;
      if (t.completedAt) continue; // ya estaba hecha: nada que desbloquear
      const stillBlocked = t.blockedBy.some((b) => b.blocker.id !== taskId && !b.blocker.completedAt);
      if (stillBlocked) continue; // le quedan otras bloqueadoras: aún no le toca
      if (!t.assigneeId || t.assigneeId === actorId) continue; // sin responsable o se avisaría a sí mismo
      await notify(t.assigneeId, {
        type: "task",
        event: "task_unlocked",
        title: `Te toca: «${t.title}»`,
        body: `«${done?.title ?? "La tarea anterior"}» quedó completada y la desbloqueó.`,
        link: t.projectId ? `/proyectos/${t.projectId}?tab=tareas` : "/mis-tareas",
        actorId: actorId ?? undefined,
      }).catch(() => null);
    }
  } catch {
    /* el aviso es cortesía; el completar ya quedó firme */
  }
}

// ¿Crearía un CICLO añadir «taskId bloqueada por blockerId»? Sube por la cadena de bloqueadoras
// de `blockerId`: si en algún punto aparece `taskId`, la dependencia sería circular. Tope de
// profundidad por sanidad (las cadenas reales son cortas).
export async function wouldCreateCycle(taskId: string, blockerId: string): Promise<boolean> {
  if (taskId === blockerId) return true;
  const seen = new Set<string>([taskId]);
  let frontier = [blockerId];
  for (let depth = 0; depth < 50 && frontier.length; depth++) {
    const rows = await db.taskDependency.findMany({
      where: { taskId: { in: frontier } },
      select: { blockerId: true },
    });
    const next: string[] = [];
    for (const r of rows) {
      if (seen.has(r.blockerId)) return true;
      seen.add(r.blockerId);
      next.push(r.blockerId);
    }
    frontier = next;
  }
  return false;
}
