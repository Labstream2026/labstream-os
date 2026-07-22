import { db } from "@/lib/db";
import { aliveProjectWhere } from "@/lib/project-access";
import { getTaskLabels } from "@/lib/workflow-labels";
import { notify } from "@/lib/notify";
import { formatBogota } from "@/lib/bogota-time";
import { AUTO_TASK_PREFIX, recalcProgress } from "@/lib/deliverable-tasks";

// ── Barrido de SLA del flujo de entregables ──
// Dos vencimientos, con reglas distintas:
//
// 1) PRE-APROBACIÓN (Deliverable.internalReviewDueAt): al vencer el plazo, cada tarea
//    «Pre-aprobar…» abierta se JUZGA individualmente:
//      · el revisor dejó comentarios internos o una decisión desde que se creó su tarea
//        → CUMPLIÓ: la tarea se completa normal (revisó, aunque no haya decidido él).
//      · no hizo nada → INCUMPLIÓ: la tarea se cierra con `breachedAt` (chip «Incumplida»,
//        baja su % de cumplimiento) y se le avisa. El flujo NO se bloquea: sigue su curso.
//
// 2) CORRECCIÓN (Deliverable.fixDueAt): al vencer, la tarea «Corregir…» abierta se marca
//    con `breachedAt` pero NO se cierra — la corrección sigue pendiente; cuando el editor
//    por fin suba la versión, la tarea se completará conservando el incumplimiento
//    ("se incumple aunque la envíe después").
//
// Sin cron propio: se dispara de pasada con el poll de la campana (throttle en memoria,
// válido porque la app corre en UN contenedor) y con los crons de marcebot/recordatorios.

let lastSweepAt = 0;
const SWEEP_THROTTLE_MS = 30_000;

// ¿El revisor "actuó" sobre el entregable desde que recibió su tarea? Cuenta cualquier
// comentario interno (aunque no haya decidido) o una decisión interna suya.
async function reviewerActed(deliverableId: string, userId: string, since: Date): Promise<boolean> {
  const decision = await db.deliverableDecision.findFirst({
    where: { deliverableId, stage: "INTERNA", byUserId: userId, createdAt: { gte: since } },
    select: { id: true },
  });
  if (decision) return true;
  const comment = await db.reviewComment.findFirst({
    where: { deliverableId, fromClient: false, authorUserId: userId, createdAt: { gte: since } },
    select: { id: true },
  });
  return !!comment;
}

export async function sweepDeliverableSla(opts?: { force?: boolean; now?: Date }): Promise<{ settled: number; breached: number }> {
  const now = opts?.now ?? new Date();
  if (!opts?.force && Date.now() - lastSweepAt < SWEEP_THROTTLE_MS) return { settled: 0, breached: 0 };
  lastSweepAt = Date.now();
  let settled = 0;
  let breached = 0;

  // ── 1) Pre-aprobaciones vencidas ──
  const reviewTasks = await db.task.findMany({
    where: {
      completedAt: null,
      title: { startsWith: AUTO_TASK_PREFIX.review },
      // Proyecto DORMIDO (papelera/terminado): su SLA no corre — ni cierres ni incumplidas ni avisos.
      deliverable: { internalReviewDueAt: { lte: now }, project: aliveProjectWhere },
    },
    select: {
      id: true,
      title: true,
      assigneeId: true,
      projectId: true,
      createdAt: true,
      deliverable: { select: { id: true, name: true, internalReviewDueAt: true, project: { select: { leadId: true, name: true } } } },
    },
  });
  const touchedProjects = new Set<string>();
  for (const t of reviewTasks) {
    if (!t.deliverable) continue;
    const acted = t.assigneeId ? await reviewerActed(t.deliverable.id, t.assigneeId, t.createdAt) : false;
    // Cierre atómico (solo si sigue abierta): reintentos o carreras no duplican.
    const { statuses } = await getTaskLabels();
    const doneKey = statuses.find((s) => s.isDone)?.key ?? "COMPLETADA";
    const res = await db.task.updateMany({
      where: { id: t.id, completedAt: null },
      data: { status: doneKey, completedAt: now, ...(acted ? {} : { breachedAt: now }) },
    });
    if (res.count !== 1) continue;
    settled += 1;
    if (t.projectId) touchedProjects.add(t.projectId);
    if (!acted) {
      breached += 1;
      if (t.assigneeId) {
        await notify(t.assigneeId, {
          type: "review",
          event: "review_sla",
          subjectId: t.assigneeId, // color del responsable del entregable
          title: `Se venció tu pre-aprobación: ${t.deliverable.name}`,
          body: `El plazo era ${formatBogota(t.deliverable.internalReviewDueAt!)} y no quedó registrada tu revisión. La tarea se cerró con incumplimiento.`,
          link: `/revisiones/${t.deliverable.id}`,
        }).catch(() => null);
      }
      const leadId = t.deliverable.project.leadId;
      if (leadId && leadId !== t.assigneeId) {
        await notify(leadId, {
          type: "review",
          event: "review_sla",
          subjectId: t.assigneeId, // color del responsable del entregable
          title: `Pre-aprobación vencida sin revisar: ${t.deliverable.name}`,
          body: `El plazo interno venció y una de las revisiones asignadas no se hizo («${t.deliverable.project.name}»).`,
          link: `/revisiones/${t.deliverable.id}`,
        }).catch(() => null);
      }
    }
  }
  for (const pid of touchedProjects) await recalcProgress(pid).catch(() => null);

  // ── 2) Correcciones vencidas (marca, sin cerrar) ──
  const fixTasks = await db.task.findMany({
    where: {
      completedAt: null,
      breachedAt: null,
      title: { startsWith: AUTO_TASK_PREFIX.fix },
      deliverable: { fixDueAt: { lte: now }, project: aliveProjectWhere },
    },
    select: {
      id: true,
      assigneeId: true,
      deliverable: { select: { id: true, name: true, fixDueAt: true, project: { select: { leadId: true } } } },
    },
  });
  for (const t of fixTasks) {
    if (!t.deliverable) continue;
    const res = await db.task.updateMany({ where: { id: t.id, breachedAt: null }, data: { breachedAt: now } });
    if (res.count !== 1) continue;
    breached += 1;
    if (t.assigneeId) {
      await notify(t.assigneeId, {
        type: "review",
        event: "review_sla",
        subjectId: t.assigneeId, // color del responsable del entregable
        title: `Se venció el plazo de la corrección: ${t.deliverable.name}`,
        body: `El plazo era ${formatBogota(t.deliverable.fixDueAt!)}. Sube la nueva versión cuanto antes: la tarea ya quedó con incumplimiento.`,
        link: `/revisiones/${t.deliverable.id}`,
      }).catch(() => null);
    }
    const leadId = t.deliverable.project.leadId;
    if (leadId && leadId !== t.assigneeId) {
      await notify(leadId, {
        type: "review",
        event: "review_sla",
        subjectId: t.assigneeId, // color del responsable del entregable
        title: `Corrección vencida sin entregar: ${t.deliverable.name}`,
        body: `El plazo (${formatBogota(t.deliverable.fixDueAt!)}) venció y la nueva versión no ha llegado.`,
        link: `/revisiones/${t.deliverable.id}`,
      }).catch(() => null);
    }
  }

  return { settled, breached };
}
