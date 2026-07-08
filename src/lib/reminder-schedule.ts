// ── Recurrencia de recordatorios (matemática PURA, sin BD) ──
// Compartida por el servidor (barrido/acciones) y los formularios cliente. Todo se piensa en
// HORA DE PARED DE BOGOTÁ (UTC-5 fijo, sin horario de verano): el usuario dice "los lunes a
// las 8:00" y eso significa 8:00 de Colombia siempre; internamente se convierte al instante
// UTC exacto para que el barrido compare contra now() sin zonas de por medio.

export type ReminderSchedule = {
  frequency: string; // UNA_VEZ | DIARIO | SEMANAL | MENSUAL
  weekdays?: string | null; // "1,3,5" (0=domingo) para SEMANAL
  dayOfMonth?: number | null; // 1..31 para MENSUAL
  timeOfDay: string; // "HH:mm" hora de Bogotá
};

export const WEEKDAY_LABELS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

const DAY_MS = 86_400_000;
const BOGOTA_OFFSET = "-05:00";

// Instante UTC de una fecha+hora de pared de Bogotá.
export function utcFromBogota(ymd: string, hhmm: string): Date {
  return new Date(`${ymd}T${hhmm}:00.000${BOGOTA_OFFSET}`);
}

// Fecha de calendario de Bogotá (YYYY-MM-DD) de un instante.
export function bogotaYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
}

// Suma días a un YYYY-MM-DD sin tocar zonas (ancla a mediodía UTC, como el resto de la app).
export function ymdPlus(ymd: string, days: number): string {
  return new Date(new Date(`${ymd}T12:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T12:00:00.000Z`).getUTCDay(); // 0=domingo
}

function parseWeekdays(weekdays?: string | null): number[] {
  return (weekdays ?? "")
    .split(",")
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

// ¿La regla recurrente "toca" en esta fecha de calendario?
function matchesDay(s: ReminderSchedule, ymd: string): boolean {
  if (s.frequency === "DIARIO") return true;
  if (s.frequency === "SEMANAL") {
    const days = parseWeekdays(s.weekdays);
    return days.length > 0 && days.includes(weekdayOf(ymd));
  }
  if (s.frequency === "MENSUAL") {
    const dom = s.dayOfMonth ?? 1;
    return Number(ymd.slice(8, 10)) === dom; // si el mes es corto (31 en febrero), se omite
  }
  return false;
}

// Próximo instante UTC ESTRICTAMENTE posterior a `after` en que la regla dispara.
// Camina día a día el calendario de Bogotá (máx. ~14 meses, de sobra para cualquier regla).
export function nextFire(s: ReminderSchedule, after: Date): Date | null {
  if (s.frequency === "UNA_VEZ") return null; // su instante es explícito, no se recalcula
  const startYmd = bogotaYmd(after);
  for (let i = 0; i < 430; i++) {
    const ymd = ymdPlus(startYmd, i);
    if (!matchesDay(s, ymd)) continue;
    const candidate = utcFromBogota(ymd, s.timeOfDay);
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  return null;
}

// Etiqueta humana de la regla: "Cada semana · lun, vie · 8:00".
export function describeSchedule(s: ReminderSchedule): string {
  if (s.frequency === "DIARIO") return `Cada día · ${s.timeOfDay}`;
  if (s.frequency === "SEMANAL") {
    const days = parseWeekdays(s.weekdays).map((d) => WEEKDAY_LABELS[d]).join(", ");
    return `Cada semana · ${days || "?"} · ${s.timeOfDay}`;
  }
  if (s.frequency === "MENSUAL") return `Cada mes · día ${s.dayOfMonth ?? 1} · ${s.timeOfDay}`;
  return "Una vez";
}

// Valida "HH:mm" (00:00–23:59).
export function isValidTime(hhmm: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm);
}

// Valida "YYYY-MM-DD".
export function isValidYmd(ymd: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !Number.isNaN(new Date(`${ymd}T12:00:00Z`).getTime());
}
