// Hora "de pared" de Bogotá, robusta: NO depende de la zona horaria del navegador ni del
// servidor. La app guarda las fechas como hora de pared en UTC (contenedor en UTC), así que
// para ubicar "ahora" en la rejilla del calendario hay que usar la hora de Bogotá explícita
// —nunca new Date().getHours(), que da la hora del servidor (UTC) o la del navegador del
// visitante—. Mismo resultado en SSR y en el cliente → sin parpadeo ni desfase de 5 horas.

export const APP_TZ = "America/Bogota";

function parts(now: Date): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
}

function pick(ps: Intl.DateTimeFormatPart[], type: string): number {
  return Number(ps.find((p) => p.type === type)?.value ?? "0");
}

// Minutos transcurridos del día (0–1439) en hora de Bogotá.
export function bogotaMinutesOfDay(now: Date = new Date()): number {
  const ps = parts(now);
  return (pick(ps, "hour") % 24) * 60 + pick(ps, "minute");
}

// Clave de día en hora de Bogotá (YYYY-M-D, mes base 0 para casar con Date.getMonth()).
export function bogotaDayKey(now: Date = new Date()): string {
  const ps = parts(now);
  return `${pick(ps, "year")}-${pick(ps, "month") - 1}-${pick(ps, "day")}`;
}

// ── Visualización canónica de fecha/hora ────────────────────────────────────
// Toda la app guarda instantes en UTC (contenedor y Postgres en UTC). Para MOSTRARLOS
// hay que fijar SIEMPRE la zona de pared del negocio (Bogotá); si no, `toLocaleString`
// usa la TZ del navegador → el mismo evento se ve con horas distintas según quién mire,
// y en SSR (servidor en UTC) sale desfasado 5 h respecto al cliente. Estas funciones dan
// el MISMO resultado en servidor y cliente, así que no hay parpadeo ni "horas perdidas".

// Instante (Date | ISO | epoch ms) → "3 jul 2026, 2:30 p. m." en hora de Bogotá.
export function formatBogota(
  value: Date | string | number,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", { timeZone: APP_TZ, ...opts }).format(d);
}

// Solo la fecha (sin hora) en hora de Bogotá.
export function formatBogotaDate(
  value: Date | string | number,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  return formatBogota(value, opts);
}

// Tiempo relativo ("hace 5 min") respecto a un "ahora" EXPLÍCITO (epoch ms). El llamador
// pasa el `nowMs` (normalmente Date.now() tomado en el cliente TRAS montar) para que el
// resultado no dependa del reloj en SSR: así servidor y cliente no discrepan. Pasado un
// mes cae a fecha absoluta, que es más útil que "hace 45 d".
export function relativeFrom(value: Date | string | number, nowMs: number): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.round((nowMs - d.getTime()) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  const days = Math.round(min / 1440);
  if (days < 30) return `hace ${days} d`;
  return formatBogotaDate(d);
}
