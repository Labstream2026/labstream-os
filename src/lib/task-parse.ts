// Quick-add de TAREAS en lenguaje natural (Tareas 2.0, Fase 1). Sobre el parser español de
// recordatorios (fechas/horas: «mañana 9am», «el viernes», «en 30 min») añade los tokens
// propios de una tarea:
//   @persona   → candidato a responsable (el server lo resuelve contra el equipo)
//   #etiqueta  → TaskTag (varias)
//   !prioridad → alta / media / baja / urgente… (el server la mapea al catálogo)
//   2h · 30m · 1h30 → estimación (estimatedMinutes)
// Orden importa: primero se EXTRAEN estos tokens (se recortan del texto) y el resto pasa por
// parseReminderText para fecha/hora; así «2h» nunca se confunde con una hora del día y
// «en 30 min» (fecha relativa) no se come como estimación.
// Import RELATIVO a propósito: el vitest del proyecto no resuelve el alias @/.
import { parseReminderText } from "./reminder-parse";

export type TaskChip = { kind: "fecha" | "hora" | "persona" | "etiqueta" | "prioridad" | "estimacion"; label: string };

export type ParsedTask = {
  title: string;
  dueYmd: string | null; // YYYY-MM-DD (día de pared Bogotá)
  dueTime: string | null; // HH:mm
  assigneeQuery: string | null; // texto tras @ (sin resolver)
  tags: string[];
  priorityQuery: string | null; // texto tras ! (sin resolver)
  estimatedMinutes: number | null;
  chips: TaskChip[];
};

// Recorta TODAS las apariciones de `re` en `text`, acumulando lo capturado vía `take`.
function extract(text: string, re: RegExp, take: (m: RegExpMatchArray) => void): string {
  return text.replace(re, (...args) => {
    const m = args as unknown as RegExpMatchArray;
    take(m);
    return " ";
  });
}

const DUR_H = /(?:^|\s)(\d{1,2})(?:[.,](\d{1,2}))?\s*h(?:oras?)?(?:\s*(\d{1,2})\s*(?:m(?:in)?)?)?(?=\s|$)/i;
const DUR_M = /(?:^|\s)(\d{1,3})\s*m(?:in(?:utos?)?)?(?=\s|$)/i;

export function parseTaskText(text: string, nowMs: number): ParsedTask {
  let work = ` ${text.trim()} `;
  let assigneeQuery: string | null = null;
  const tags: string[] = [];
  let priorityQuery: string | null = null;
  let estimatedMinutes: number | null = null;

  // @persona (la primera; los nombres compuestos se resuelven por prefijo en el server)
  work = extract(work, /@([\p{L}\p{N}._-]+)/gu, (m) => {
    if (!assigneeQuery) assigneeQuery = m[1];
  });
  // #etiquetas (todas)
  work = extract(work, /#([\p{L}\p{N}_-]+)/gu, (m) => {
    const t = m[1].toLowerCase();
    if (!tags.includes(t)) tags.push(t);
  });
  // !prioridad
  work = extract(work, /!([\p{L}]+)/gu, (m) => {
    if (!priorityQuery) priorityQuery = m[1].toLowerCase();
  });

  // Estimación en horas («2h», «1.5h», «1h30») — NUNCA si viene tras «en/dentro de» (eso es
  // fecha relativa del parser de recordatorios: «en 2 horas» = cuándo, no cuánto).
  const hm = work.match(DUR_H);
  if (hm && hm.index != null) {
    const before = work.slice(0, hm.index).trimEnd();
    const prevWord = before.split(/\s+/).pop() ?? "";
    if (!["en", "dentro", "de"].includes(prevWord)) {
      const hours = parseInt(hm[1], 10);
      const frac = hm[2] ? Number(`0.${hm[2]}`) : 0;
      const extraMin = hm[3] ? parseInt(hm[3], 10) : 0;
      estimatedMinutes = Math.round(hours * 60 + frac * 60 + extraMin);
      work = work.slice(0, hm.index) + " " + work.slice(hm.index + hm[0].length);
    }
  }
  // Estimación en minutos sueltos («30m», «45 min») con la misma excepción de «en 30 min».
  if (estimatedMinutes == null) {
    const mm = work.match(DUR_M);
    if (mm && mm.index != null) {
      const before = work.slice(0, mm.index).trimEnd();
      const prevWord = before.split(/\s+/).pop() ?? "";
      if (!["en", "dentro", "de"].includes(prevWord)) {
        estimatedMinutes = parseInt(mm[1], 10);
        work = work.slice(0, mm.index) + " " + work.slice(mm.index + mm[0].length);
      }
    }
  }

  // Fecha/hora con el parser de recordatorios (solo UNA_VEZ interesa aquí: una tarea no
  // «se repite» — para eso están las tareas recurrentes con su propio editor).
  const r = parseReminderText(work.replace(/\s+/g, " ").trim(), nowMs);
  const dueYmd = r.matched && r.frequency === "UNA_VEZ" && r.alerts[0] ? r.alerts[0].date : null;
  const dueTime = dueYmd && r.alerts[0].time ? r.alerts[0].time : null;

  const chips: TaskChip[] = [];
  for (const c of r.chips) {
    if (c.fallback) continue; // el default («hoy 9am») no aplica a tareas: sin fecha = sin fecha
    if (c.kind === "date") chips.push({ kind: "fecha", label: c.label });
    if (c.kind === "time") chips.push({ kind: "hora", label: c.label });
  }
  if (assigneeQuery) chips.push({ kind: "persona", label: `@${assigneeQuery}` });
  for (const t of tags) chips.push({ kind: "etiqueta", label: `#${t}` });
  if (priorityQuery) chips.push({ kind: "prioridad", label: `!${priorityQuery}` });
  if (estimatedMinutes != null) {
    const h = Math.floor(estimatedMinutes / 60);
    const m = estimatedMinutes % 60;
    chips.push({ kind: "estimacion", label: `⏱ ${h ? `${h}h` : ""}${m ? `${m}m` : h ? "" : "0m"}` });
  }

  return {
    title: r.title.trim(),
    dueYmd,
    dueTime,
    assigneeQuery,
    tags,
    priorityQuery,
    estimatedMinutes,
    chips,
  };
}
