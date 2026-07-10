// ── Horas HÁBILES para los plazos del flujo de entregables ──
// Regla de la casa: sábado y domingo NO se trabaja. Un plazo de "24 horas" que caiga en
// fin de semana se corre al mismo horario del lunes (correcciones enviadas el viernes a
// las 3 pm vencen el lunes a las 3 pm, no el sábado).
// Módulo PURO (sin Date.now()): recibe siempre el instante base como parámetro.

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", weekday: "short" });

/** Día de la semana del instante, en Bogotá ("Sat", "Sun", …). */
function bogotaWeekday(d: Date): string {
  return WEEKDAY_FMT.format(d);
}

/** ¿El instante cae en fin de semana (hora de Bogotá)? */
export function isWeekendBogota(d: Date): boolean {
  const w = bogotaWeekday(d);
  return w === "Sat" || w === "Sun";
}

/**
 * Suma horas HÁBILES: suma las horas de reloj y, si el resultado cae en sábado o domingo
 * (Bogotá), lo corre de 24 en 24 horas hasta el siguiente día hábil al mismo horario.
 * Bogotá no tiene horario de verano, así que sumar días en UTC conserva la hora de pared.
 */
export function plusBusinessHours(from: Date, hours: number): Date {
  let t = from.getTime() + hours * 3_600_000;
  while (isWeekendBogota(new Date(t))) t += 24 * 3_600_000;
  return new Date(t);
}

/** Plazo por defecto de una corrección: 24 horas hábiles desde ahora. */
export function defaultFixDeadline(now: Date): Date {
  return plusBusinessHours(now, 24);
}
