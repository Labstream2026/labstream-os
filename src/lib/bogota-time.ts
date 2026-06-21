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
