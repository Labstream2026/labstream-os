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

// Días enteros transcurridos desde `date` hasta `now` (negativo si es futuro).
export function daysSince(date: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}

// Días enteros que faltan hasta `date` (negativo si ya pasó).
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
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
