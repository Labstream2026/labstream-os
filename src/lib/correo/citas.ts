// ── Detector de CITAS en correos ────────────────────────────────────────────
// Lee el asunto + el comienzo del cuerpo y, si hay fecha/hora en español («el jueves 21 a
// las 3 pm», «mañana 10am»), propone la cita. PURO (recibe nowMs) y montado sobre el MISMO
// parser de los recordatorios (reminder-parse): una sola gramática de fechas en la app.
//
// Regla de precisión: hora explícita = cita casi segura; fecha sin hora solo si el texto
// suena a reunión (señales) — un «el 30» suelto en una factura no debe volverse evento.
// Es una OFERTA en un banner, nunca una acción automática: la persona confirma y ajusta.

import { parseReminderText } from "../reminder-parse";
import { utcFromBogota } from "../reminder-schedule";
import { asuntoLimpio } from "./hilos";

export type CitaDetectada = {
  fecha: string; // YYYY-MM-DD (Bogotá)
  hora: string; // HH:mm
  etiqueta: string; // «jue 21 ago · 15:00»
  tituloSugerido: string;
  /** Enlace de videollamada si el correo lo trae (Meet/Zoom/Teams): pre-llena el lugar. */
  enlaceVideo: string | null;
};

const SENALES = /\b(reuni[oó]n|junta|llamada|videollamada|cita|meet\b|meeting|agendar|agendemos|nos\s+vemos|visita|grabaci[oó]n|rodaje|scouting|kickoff|presentaci[oó]n|call\b)\b/i;
const VIDEO_RE = /(https?:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com|teams\.live\.com)\/[^\s<>"')\]]+)/i;

const ETIQUETA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short" });

export function detectarCita(asunto: string, cuerpo: string | null | undefined, nowMs: number): CitaDetectada | null {
  // El comienzo del cuerpo basta: la logística de una reunión va en las primeras líneas —
  // y recorrer correos kilométricos multiplica falsos positivos de números sueltos.
  const texto = `${asunto}\n${(cuerpo ?? "").slice(0, 1500)}`;
  const r = parseReminderText(texto, nowMs);
  if (!r.matched || r.frequency !== "UNA_VEZ" || r.alerts.length === 0) return null;

  const horaExplicita = r.chips.some((c) => c.kind === "time" && !c.fallback);
  const fechaExplicita = r.chips.some((c) => c.kind === "date" && !c.fallback);
  if (!horaExplicita && !(fechaExplicita && SENALES.test(texto))) return null;

  const { date, time } = r.alerts[0];
  // En el pasado no hay cita (el parser empuja hacia adelante casi todo; doble candado).
  if (utcFromBogota(date, time).getTime() < nowMs - 60_000) return null;

  return {
    fecha: date,
    hora: time,
    etiqueta: `${ETIQUETA.format(utcFromBogota(date, "12:00")).replace(/\./g, "")} · ${time}`,
    tituloSugerido: asuntoLimpio(asunto),
    enlaceVideo: VIDEO_RE.exec(cuerpo ?? "")?.[1] ?? null,
  };
}

/** HH:mm + minutos (mismo día; se acota a 23:59 — una cita no cruza medianoche aquí). */
export function horaMas(hora: string, minutos: number): string {
  const [h, m] = hora.split(":").map(Number);
  const total = Math.min(h * 60 + m + Math.max(0, minutos), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
