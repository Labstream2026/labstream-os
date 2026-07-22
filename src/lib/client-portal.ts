// ── Portal del cliente: helpers compartidos ──
// Fases del "viaje" que ve el cliente (Brief → Producción → Revisión → Entrega) derivadas de
// datos que YA existen (estado del proyecto + estados de sus entregables de cara al cliente).
// Cero trabajo extra del equipo: nadie mantiene fases a mano.

// Estados de un entregable que YA son visibles para el cliente (mismo criterio que Mis entregas).
export const CLIENT_DELIVERABLE_STATES = ["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"] as const;

// Tipos de SOLICITUD del cliente (formulario estructurado, no texto libre). Vive aquí (módulo
// puro) porque lo comparten el server action, la página del cliente y el panel del equipo.
export const REQUEST_TYPES: Record<string, { label: string; emoji: string }> = {
  CAMBIO: { label: "Cambio en una pieza", emoji: "✏️" },
  MATERIAL: { label: "Nuevo material", emoji: "📤" },
  PREGUNTA: { label: "Pregunta", emoji: "❓" },
  REUNION: { label: "Reunión", emoji: "📅" },
};

// Estados de una solicitud, en la voz del cliente.
export const REQUEST_STATUS: Record<string, { label: string; className: string }> = {
  RECIBIDA: { label: "Recibida", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  EN_CURSO: { label: "En curso", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" },
  RESUELTA: { label: "Resuelta ✓", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

export type ClientPhaseState = "done" | "now" | "todo";
export type ClientPhase = { key: string; label: string; state: ClientPhaseState };

type PhaseInput = {
  status: string;
  finishedAt: Date | null;
  deliverables: { status: string }[]; // SOLO las de cara al cliente (CLIENT_DELIVERABLE_STATES)
};

const PHASE_LABELS = ["Brief", "Producción", "Revisión", "Entrega"] as const;

// Índice de fase actual (0..3) o 4 = todo terminado.
function phaseIndex(p: PhaseInput): number {
  if (p.finishedAt) return 4;
  const byStatus: Record<string, number> = {
    NUEVO: 0, EN_PLANEACION: 0,
    EN_PREPRODUCCION: 1, EN_PRODUCCION: 1, EN_EDICION: 1, REVISION_INTERNA: 1, PAUSADO: 1,
    REVISION_CLIENTE: 2, CORRECCIONES: 2,
    APROBADO: 3,
    ENTREGADO: 4, CERRADO: 4, CANCELADO: 4,
  };
  let idx = byStatus[p.status] ?? 1;
  // Los entregables mandan sobre el estado (que a veces se queda viejo): si hay piezas
  // esperando al cliente → mínimo Revisión; si TODAS ya están aprobadas → mínimo Entrega.
  if (p.deliverables.some((d) => d.status === "ENVIADO_CLIENTE" || d.status === "CORRECCIONES")) {
    idx = Math.max(idx, 2);
  } else if (p.deliverables.length > 0 && p.deliverables.every((d) => d.status === "APROBADO" || d.status === "ENTREGADO")) {
    idx = Math.max(idx, 3);
  }
  return idx;
}

export function clientPhases(p: PhaseInput): ClientPhase[] {
  const idx = phaseIndex(p);
  return PHASE_LABELS.map((label, i) => ({
    key: label.toLowerCase(),
    label,
    state: i < idx ? "done" : i === idx ? "now" : "todo",
  }));
}

// Pill de estado en la voz del cliente + clases de color (mismo lenguaje de Mis entregas).
export function clientPhasePill(p: PhaseInput): { label: string; className: string } {
  const idx = phaseIndex(p);
  if (idx >= 4) return { label: "Terminado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" };
  return [
    { label: "En brief", className: "bg-muted text-muted-foreground" },
    { label: "En producción", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" },
    { label: "En revisión", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
    { label: "En entrega", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  ][idx];
}

// Texto automático de «¿Qué sigue?» cuando el equipo no ha escrito uno (Project.nextForClient).
export function autoNextForClient(p: PhaseInput): string {
  const idx = phaseIndex(p);
  const pending = p.deliverables.filter((d) => d.status === "ENVIADO_CLIENTE").length;
  if (idx >= 4) return "Este proyecto está terminado. Todo el material aprobado sigue disponible aquí.";
  if (pending > 0) {
    return pending === 1
      ? "Hay una pieza lista esperando tu revisión: ábrela, coméntala y apruébala o pide cambios."
      : `Hay ${pending} piezas listas esperando tu revisión: ábrelas, coméntalas y aprueba o pide cambios.`;
  }
  return [
    "Estamos afinando el brief y la planeación. Te avisaremos cuando arranque la producción.",
    "El equipo está en plena producción de tu material. Te avisaremos en cuanto haya una versión lista para tu revisión.",
    "Estamos aplicando los ajustes de la revisión. Te avisaremos cuando la nueva versión esté lista.",
    "Tu material está aprobado: estamos preparando la entrega final.",
  ][idx];
}
