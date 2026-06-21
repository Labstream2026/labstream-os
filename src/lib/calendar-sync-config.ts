import { db } from "@/lib/db";

// Configuración del sondeo de calendarios Synology (fila única "default"). Si no existe,
// se usan valores por defecto: encendido, cada 15 min, 8:00–18:00, todos los días.
// La franja horaria se interpreta en hora de Bogotá (ver calendar-scheduler).

export type CalendarSyncConfig = {
  enabled: boolean;
  everyMinutes: number;
  startHour: number;
  endHour: number;
  workDays: number[];
};

export const CALENDAR_SYNC_DEFAULTS: CalendarSyncConfig = {
  enabled: true,
  everyMinutes: 15,
  startHour: 8,
  endHour: 18,
  workDays: [0, 1, 2, 3, 4, 5, 6],
};

// "0,1,2,3,4,5,6" → [0..6] (días válidos 0=Dom … 6=Sáb, sin duplicados, ordenados).
export function parseSyncDays(s: string): number[] {
  const ds = s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return ds.length ? [...new Set(ds)].sort((a, b) => a - b) : [...CALENDAR_SYNC_DEFAULTS.workDays];
}

export async function getCalendarSyncConfig(): Promise<CalendarSyncConfig> {
  const row = await db.calendarSyncSettings.findUnique({ where: { id: "default" } });
  if (!row) return { ...CALENDAR_SYNC_DEFAULTS };
  return {
    enabled: row.enabled,
    everyMinutes: row.everyMinutes,
    startHour: row.startHour,
    endHour: row.endHour,
    workDays: parseSyncDays(row.workDays),
  };
}
