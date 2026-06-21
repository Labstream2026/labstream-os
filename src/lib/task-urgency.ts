// Fuente única de verdad para el "estado de fecha" de una tarea: termómetro de urgencia
// (de vencida → lejana) y a tiempo/tarde. Módulo PURO (sin imports de servidor) para usarse
// igual en componentes cliente (tablero, lista, mis-tareas) y servidor (reportes).
//
// Termómetro (cálido = cerca/atrasada · frío = lejos):
//   vencida (rojo) → hoy (naranja) → pronto 1-3d (ámbar) → proximo 4-7d (verde) → lejano +7d (turquesa)
//   sin fecha (gris) · hecha (esmeralda) · hecha_tarde (ámbar)

export type UrgencyState =
  | "sin" // sin fecha de entrega
  | "lejano" // falta más de una semana
  | "proximo" // 4–7 días
  | "pronto" // 1–3 días
  | "hoy" // vence hoy
  | "a_tiempo" // (compat) pendiente con holgura — ya no se produce, se conserva por seguridad
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
  if (days === 0) return { state: "hoy", days };
  if (days <= 3) return { state: "pronto", days };
  if (days <= 7) return { state: "proximo", days };
  return { state: "lejano", days };
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
    case "hoy":
      return "Vence hoy";
    case "pronto":
      if (days === 1) return "Falta 1 día";
      return `Faltan ${days} días`;
    case "proximo":
    case "lejano":
    case "a_tiempo":
      return `Faltan ${days} días`;
  }
}

// Metadatos de color por estado (light + dark). Tres usos:
//  - className: chip pequeño (compat — lo usan tablero y lista).
//  - row: franja teñida de la fila completa (bg + borde).
//  - text: color de texto fuerte para la etiqueta de "faltan X días".
//  - dot: punto sólido.
export const URGENCY_META: Record<
  UrgencyState,
  { className: string; dot: string; row: string; text: string }
> = {
  sin: {
    className: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400",
    dot: "bg-slate-400",
    row: "bg-slate-50 border-slate-200 dark:bg-slate-500/10 dark:border-slate-500/20",
    text: "text-slate-500 dark:text-slate-400",
  },
  a_tiempo: {
    className: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    dot: "bg-teal-500",
    row: "bg-teal-50 border-teal-200 dark:bg-teal-500/10 dark:border-teal-500/25",
    text: "text-teal-700 dark:text-teal-300",
  },
  lejano: {
    className: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    dot: "bg-teal-500",
    row: "bg-teal-50 border-teal-200 dark:bg-teal-500/10 dark:border-teal-500/25",
    text: "text-teal-700 dark:text-teal-300",
  },
  proximo: {
    className: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
    dot: "bg-green-500",
    row: "bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/25",
    text: "text-green-700 dark:text-green-300",
  },
  pronto: {
    className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
    row: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25",
    text: "text-amber-800 dark:text-amber-300",
  },
  hoy: {
    className: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    dot: "bg-orange-500",
    row: "bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/25",
    text: "text-orange-700 dark:text-orange-300",
  },
  vencida: {
    className: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "bg-rose-500",
    row: "bg-rose-50 border-rose-200 dark:bg-rose-500/10 dark:border-rose-500/25",
    text: "text-rose-700 dark:text-rose-300",
  },
  hecha: {
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "bg-emerald-500",
    row: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/25",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  hecha_tarde: {
    className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "bg-amber-500",
    row: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25",
    text: "text-amber-800 dark:text-amber-300",
  },
};

// Clase de la franja teñida de una fila de tarea (helper directo).
export function urgencyRow(state: UrgencyState): string {
  return URGENCY_META[state].row;
}

// HEX por estado, para superficies que usan color inline (calendario, barras del cronograma).
// Mismo termómetro: vencida rojo → hoy naranja → pronto ámbar → proximo verde → lejano turquesa.
const URGENCY_HEX: Record<UrgencyState, string> = {
  sin: "#94a3b8",
  a_tiempo: "#14b8a6",
  lejano: "#14b8a6",
  proximo: "#22c55e",
  pronto: "#f59e0b",
  hoy: "#f97316",
  vencida: "#f43f5e",
  hecha: "#10b981",
  hecha_tarde: "#f59e0b",
};
export function urgencyHex(state: UrgencyState): string {
  return URGENCY_HEX[state];
}
