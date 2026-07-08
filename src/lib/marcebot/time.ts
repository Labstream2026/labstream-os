// Utilidades de tiempo ancladas a la zona horaria de Colombia (UTC-5, sin horario de
// verano). Marcebot razona siempre en hora local del equipo: «hoy», «esta semana»,
// el horario laboral y el saludo de la mañana.

const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000; // Colombia = UTC-5 fijo

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Devuelve un Date cuyos campos UTC coinciden con el reloj de pared de Bogotá.
function bogotaWall(now: Date = new Date()): Date {
  return new Date(now.getTime() - BOGOTA_OFFSET_MS);
}

// Medianoche de hoy en Bogotá, como instante real (UTC).
export function bogotaDayStart(now: Date = new Date()): Date {
  const w = bogotaWall(now);
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) + BOGOTA_OFFSET_MS);
}

// Hora del día (0-23) en Bogotá.
export function bogotaHour(now: Date = new Date()): number {
  return bogotaWall(now).getUTCHours();
}

// Día de la semana en Bogotá: 0=domingo … 5=viernes … 6=sábado.
export function bogotaWeekday(now: Date = new Date()): number {
  return bogotaWall(now).getUTCDay();
}

// Lunes 00:00 de la semana actual en Bogotá, como instante real (UTC).
export function bogotaWeekStart(now: Date = new Date()): Date {
  const start = bogotaDayStart(now);
  const back = (bogotaWeekday(now) + 6) % 7; // días transcurridos desde el lunes
  return new Date(start.getTime() - back * 24 * 60 * 60 * 1000);
}

// Clave de día "YYYY-MM-DD" en Bogotá (para deduplicar el saludo diario).
export function bogotaDateKey(now: Date = new Date()): string {
  const w = bogotaWall(now);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
}

// "lunes, 17 de junio" capitalizado.
export function bogotaLongDate(now: Date = new Date()): string {
  const s = new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Bogota",
  }).format(now);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "3:00 p. m." en hora de Bogotá.
export function bogotaTime(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  }).format(d);
}

// "17 jun" corto, para fechas de vencimiento.
export function bogotaShortDate(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" }).format(d);
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Diferencia en DÍAS-CALENDARIO de Bogotá entre dos fechas. Comparamos las medianoches
// locales (no milisegundos crudos): así una tarea que vence hoy a las 23:59 vista a las
// 10:00 da 0 ("vence hoy"), no 1 ("vence mañana"). Colombia no tiene horario de verano,
// así que la diferencia de medianoches siempre es múltiplo exacto de 24 h.
function calendarDayDiff(from: Date, to: Date): number {
  return Math.round((bogotaDayStart(to).getTime() - bogotaDayStart(from).getTime()) / DAY_MS);
}

// Días enteros transcurridos desde `date` hasta `now` (negativo si es futuro).
export function daysSince(date: Date, now: Date = new Date()): number {
  return calendarDayDiff(date, now);
}

// Días enteros que faltan hasta `date` (negativo si ya pasó).
export function daysUntil(date: Date, now: Date = new Date()): number {
  return calendarDayDiff(now, date);
}

// Texto humano de un vencimiento: "vence hoy", "vence mañana", "vence en 3 días",
// "venció hace 2 días".
export function duePhrase(date: Date, now: Date = new Date()): string {
  const u = daysUntil(date, now);
  if (u < 0) return `venció hace ${Math.abs(u)} ${Math.abs(u) === 1 ? "día" : "días"}`;
  if (u === 0) return "vence hoy";
  if (u === 1) return "vence mañana";
  return `vence en ${u} días`;
}

// «hoy 8:00 a. m.», «mañana 8:00 a. m.» o «mar 8 jul 8:00 a. m.» — para recordatorios.
export function whenPhrase(at: Date, now: Date = new Date()): string {
  const start = bogotaDayStart(now);
  const manana = new Date(start.getTime() + 86_400_000);
  const pasado = new Date(start.getTime() + 2 * 86_400_000);
  if (at < manana) return `hoy ${bogotaTime(at)}`;
  if (at < pasado) return `mañana ${bogotaTime(at)}`;
  return `${bogotaShortDate(at)} ${bogotaTime(at)}`;
}
