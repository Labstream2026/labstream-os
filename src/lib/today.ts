// "Hoy" en zona horaria de Bogotá, consistente entre servidor y cliente (mismo cálculo
// con Intl), para que las tareas siempre tengan fecha de inicio/fin aunque no se indique.

// Fecha (YYYY-MM-DD) de hoy en Bogotá — para defaultValue de <input type="date">.
export function todayInputValue(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now);
}

// Hoy a las 12:00 UTC (medio día evita saltos de día al formatear). Para guardar en BD.
export function bogotaNoon(now: Date = new Date()): Date {
  return new Date(`${todayInputValue(now)}T12:00:00.000Z`);
}
