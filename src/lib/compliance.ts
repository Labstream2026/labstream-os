import { db } from "@/lib/db";
import { getTaskLabels } from "@/lib/workflow-labels";

// Cumplimiento por persona. La protección anti-trampa ya existe (canEditTaskMeta:
// el responsable no puede mover sus propias fechas). Aquí calculamos el resultado:
// si una tarea con fecha se entrega tarde o se vence sin entregar, baja el %.

const DAY = 86_400_000;

export type ComplianceUser = {
  id: string;
  name: string | null;
  initials: string | null;
  avatarColor: string | null;
};

export type PersonComplianceRow = {
  user: ComplianceUser;
  onTime: number; // completada en o antes de la fecha
  late: number; // completada después de la fecha
  overdueOpen: number; // sin completar y ya vencida
  judged: number; // onTime + late + overdueOpen (tareas "evaluables")
  openOnTrack: number; // pendientes aún no vencidas (informativo, no penaliza)
  pct: number | null; // onTime / judged (0–100), null si no hay evaluables
  avgCycleDays: number | null; // promedio (completedAt − createdAt) de las completadas
};

type Acc = {
  user: ComplianceUser;
  onTime: number;
  late: number;
  overdueOpen: number;
  openOnTrack: number;
  cycleSumMs: number;
  cycleN: number;
};

export type ComplianceOpts = {
  projectId?: string;
  from?: Date;
  to?: Date;
  userId?: string; // limita a una persona (para la insignia personal)
  now?: Date;
};

function finalize(acc: Acc): PersonComplianceRow {
  const judged = acc.onTime + acc.late + acc.overdueOpen;
  return {
    user: acc.user,
    onTime: acc.onTime,
    late: acc.late,
    overdueOpen: acc.overdueOpen,
    openOnTrack: acc.openOnTrack,
    judged,
    pct: judged > 0 ? Math.round((acc.onTime / judged) * 100) : null,
    avgCycleDays:
      acc.cycleN > 0 ? Math.round(acc.cycleSumMs / acc.cycleN / DAY) : null,
  };
}

/**
 * Filas de cumplimiento por persona, sobre tareas con responsable y fecha de
 * entrega. Opcionalmente acotado a un proyecto, rango de fechas o una persona.
 */
export async function personCompliance(
  opts: ComplianceOpts = {},
): Promise<PersonComplianceRow[]> {
  const now = opts.now ?? new Date();

  const dueFilter: { not: null; gte?: Date; lte?: Date } = { not: null };
  if (opts.from) dueFilter.gte = opts.from;
  if (opts.to) dueFilter.lte = opts.to;

  const tasks = await db.task.findMany({
    where: {
      assigneeId: opts.userId ? opts.userId : { not: null },
      dueDate: dueFilter,
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
    },
    select: {
      assigneeId: true,
      dueDate: true,
      completedAt: true,
      createdAt: true,
      assignee: {
        select: { id: true, name: true, initials: true, avatarColor: true },
      },
    },
  });

  const map = new Map<string, Acc>();
  for (const t of tasks) {
    if (!t.assignee) continue;
    const uid = t.assignee.id;
    let acc = map.get(uid);
    if (!acc) {
      acc = {
        user: t.assignee,
        onTime: 0,
        late: 0,
        overdueOpen: 0,
        openOnTrack: 0,
        cycleSumMs: 0,
        cycleN: 0,
      };
      map.set(uid, acc);
    }
    if (t.completedAt) {
      if (t.dueDate && t.completedAt.getTime() > t.dueDate.getTime()) acc.late++;
      else acc.onTime++;
      acc.cycleSumMs += t.completedAt.getTime() - t.createdAt.getTime();
      acc.cycleN++;
    } else if (t.dueDate && now.getTime() > t.dueDate.getTime()) {
      acc.overdueOpen++;
    } else {
      acc.openOnTrack++;
    }
  }

  return [...map.values()]
    .map(finalize)
    // Orden: peor cumplimiento primero (los que necesitan atención), luego por carga.
    .sort((a, b) => {
      const pa = a.pct ?? 101;
      const pb = b.pct ?? 101;
      if (pa !== pb) return pa - pb;
      return b.judged - a.judged;
    });
}

/** Resumen de una sola persona (para la insignia de SLA en "Mis tareas"). */
export async function userComplianceSummary(
  userId: string,
  opts: Omit<ComplianceOpts, "userId"> = {},
): Promise<PersonComplianceRow | null> {
  const rows = await personCompliance({ ...opts, userId });
  return rows[0] ?? null;
}

/** Reexport por conveniencia: saber qué estados cuentan como "terminado". */
export async function doneStatusKeys(): Promise<string[]> {
  const { statuses } = await getTaskLabels();
  return statuses.filter((s) => s.isDone).map((s) => s.key);
}
