// Matemática de fechas del cronograma (Gantt), pura y sin dependencias.
//
// Todo el dominio temporal se modela en "números de día" absolutos en UTC (días
// transcurridos desde epoch), de modo que posicionar barras = aritmética de enteros.
// Las fechas de la app se guardan ancladas a mediodía UTC ("YYYY-MM-DDT12:00:00Z"),
// así que la clave de día (slice 0..10) coincide con el día de calendario real.

const DAY_MS = 86_400_000;

export type TimelineUnit = "day" | "week" | "month";

// Ancho en píxeles de cada DÍA según el zoom. El grid trabaja siempre en días; el
// zoom solo cambia la densidad, lo que da barras precisas en cualquier nivel.
export const DAY_WIDTH: Record<TimelineUnit, number> = { day: 38, week: 16, month: 5.2 };

export const MONTHS_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];
const WEEKDAYS_SHORT = ["D", "L", "M", "X", "J", "V", "S"]; // getUTCDay: 0=Dom

// "YYYY-MM-DD" → número de día absoluto en UTC.
export function dayNumberOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

// número de día absoluto → "YYYY-MM-DD".
export function keyOfDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

// Date | string (anclada a mediodía UTC) → "YYYY-MM-DD", o null.
export function dayKey(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// "YYYY-MM-DD" → Date a mediodía UTC (formato de guardado coherente con la app).
export function noonUTC(key: string): Date {
  return new Date(`${key}T12:00:00.000Z`);
}

// Día de HOY en hora LOCAL como clave (para la línea de "hoy"). Colombia es UTC-5,
// así que el día local y el anclado a mediodía UTC coinciden.
export function todayKey(): string {
  const n = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

export function isWeekend(dayNumber: number): boolean {
  const wd = new Date(dayNumber * DAY_MS).getUTCDay();
  return wd === 0 || wd === 6;
}

export function weekdayInitial(dayNumber: number): string {
  return WEEKDAYS_SHORT[new Date(dayNumber * DAY_MS).getUTCDay()];
}

export function dayOfMonth(dayNumber: number): number {
  return new Date(dayNumber * DAY_MS).getUTCDate();
}

// ¿Es lunes? (inicio de semana, para gridlines).
export function isMonday(dayNumber: number): boolean {
  return new Date(dayNumber * DAY_MS).getUTCDay() === 1;
}

export type MonthSegment = { key: string; label: string; offsetDays: number; days: number };

// Divide [startNum, endNum] (inclusive) en segmentos por mes, para la banda superior.
export function monthSegments(startNum: number, endNum: number): MonthSegment[] {
  const out: MonthSegment[] = [];
  let cursor = startNum;
  while (cursor <= endNum) {
    const dt = new Date(cursor * DAY_MS);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth();
    const monthEndNum = Math.round(Date.UTC(y, m + 1, 0) / DAY_MS); // último día del mes
    const segEnd = Math.min(monthEndNum, endNum);
    out.push({
      key: `${y}-${m}`,
      label: `${MONTHS_SHORT[m]} ${y}`,
      offsetDays: cursor - startNum,
      days: segEnd - cursor + 1,
    });
    cursor = segEnd + 1;
  }
  return out;
}

// Rango del cronograma a partir de las claves de fecha presentes (+ hoy), con
// margen y ajuste al inicio/fin de semana para que cuadre visualmente.
export function computeRange(keys: (string | null | undefined)[], padDays = 3): { startNum: number; endNum: number } {
  const nums = keys.filter(Boolean).map((k) => dayNumberOf(k as string));
  const today = dayNumberOf(todayKey());
  nums.push(today);
  let min = Math.min(...nums) - padDays;
  let max = Math.max(...nums) + padDays;
  // Asegurar una ventana mínima de ~3 semanas para que no se vea vacío.
  if (max - min < 21) max = min + 21;
  // Ajustar el inicio al lunes anterior.
  while (new Date(min * DAY_MS).getUTCDay() !== 1) min--;
  // Ajustar el fin al domingo siguiente.
  while (new Date(max * DAY_MS).getUTCDay() !== 0) max++;
  return { startNum: min, endNum: max };
}

// Posición (en días desde el inicio) y duración de una barra. `end` es inclusivo.
export function barSpan(
  startKey: string | null,
  endKey: string | null,
  rangeStart: number,
): { offsetDays: number; spanDays: number } | null {
  const s = startKey ? dayNumberOf(startKey) : null;
  const e = endKey ? dayNumberOf(endKey) : null;
  if (s == null && e == null) return null;
  const from = s ?? (e as number);
  const to = e ?? (s as number);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return { offsetDays: lo - rangeStart, spanDays: hi - lo + 1 };
}

// ── Horas ──
// minutos → "2h 30m" / "45m" / "2h".
export function formatMinutes(min: number | null | undefined): string {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// minutos → horas decimales con 1 cifra ("2.5").
export function minutesToHours(min: number | null | undefined): string {
  if (!min) return "0";
  return (Math.round((min / 60) * 10) / 10).toString();
}

// Texto del usuario → minutos. Acepta "2", "2.5", "2,5" (horas) o "2:30" (h:mm).
export function parseHoursToMinutes(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  if (s.includes(":")) {
    const [h, m] = s.split(":");
    const hours = parseInt(h || "0", 10);
    const mins = parseInt(m || "0", 10);
    if (Number.isNaN(hours) || Number.isNaN(mins)) return null;
    return hours * 60 + mins;
  }
  const hours = parseFloat(s);
  if (Number.isNaN(hours) || hours < 0) return null;
  return Math.round(hours * 60);
}
