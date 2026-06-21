// Fuente única de verdad para el "estado de fecha" de una tarea: cuenta regresiva
// y a tiempo/tarde. Módulo PURO (sin imports de servidor) para usarse igual en
// componentes cliente (tablero, lista, mis-tareas) y servidor (reportes).

export type UrgencyState =
  | "sin" // sin fecha de entrega
  | "a_tiempo" // pendiente, con holgura
  | "pronto" // vence en ≤ 2 días
  | "vencida" // pasó la fecha y no está hecha
  | "hecha" // completada a tiempo
  | "hecha_tarde"; // completada, pero después de la fecha

const DAY = 86_400_000;

function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  return isNaN(x.getTime()) ? null : x;
}

// Día (en UTC) a medianoche, para contar días de calendario de forma estable
// (el contenedor corre en UTC; convención "hora de pared en UTC").
function startOfDayUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function taskUrgency(opts: {
  dueDate: Date | string | null;
  completedAt?: Date | string | null;
  isDone?: boolean;
  now?: Date;
}): { state: UrgencyState; days: number | null } {
  const now = opts.now ?? new Date();
  const due = toDate(opts.dueDate);
  const completed = toDate(opts.completedAt);
  const done = opts.isDone || !!completed;

  if (done) {
    if (completed && due && completed.getTime() > due.getTime()) {
      return { state: "hecha_tarde", days: null };
    }
    return { state: "hecha", days: null };
  }
  if (!due) return { state: "sin", days: null };

  const days = Math.round((startOfDayUTC(due) - startOfDayUTC(now)) / DAY);
  if (days < 0) return { state: "vencida", days };
  if (days <= 2) return { state: "pronto", days };
  return { state: "a_tiempo", days };
}

export function urgencyLabel(state: UrgencyState, days: number | null): string {
  switch (state) {
    case "sin":
      return "Sin fecha";
    case "hecha":
      return "Hecha a tiempo";
    case "hecha_tarde":
      return "Hecha tarde";
    case "vencida": {
      const n = Math.abs(days ?? 0);
      return n === 0 ? "Vence hoy" : `Vencida hace ${n} día${n === 1 ? "" : "s"}`;
    }
    case "pronto":
      if (days === 0) return "Vence hoy";
      if (days === 1) return "Falta 1 día";
      return `Faltan ${days} días`;
    case "a_tiempo":
      return `Faltan ${days} días`;
  }
}

// Clases (light + dark) coherentes con los mapas de ui.ts (StatusMeta).
export const URGENCY_META: Record<
  UrgencyState,
  { className: string; dot: string }
> = {
  sin: {
    className: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400",
    dot: "bg-slate-400",
  },
  a_tiempo: {
    className: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  pronto: {
    className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  vencida: {
    className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  hecha: {
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  hecha_tarde: {
    className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
  },
};
