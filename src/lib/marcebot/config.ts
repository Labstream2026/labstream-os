import { db } from "@/lib/db";

// Configuración de Marcebot (encendido, días laborales y franja horaria). Fila única
// "default"; si aún no existe, se usan los valores por defecto (lun–vie, 7:00–16:00).

export type MarcebotConfig = { enabled: boolean; workDays: number[]; startHour: number; lastHour: number };

export const MARCEBOT_DEFAULTS: MarcebotConfig = { enabled: true, workDays: [1, 2, 3, 4, 5], startHour: 7, lastHour: 16 };

// "1,2,3,4,5" → [1,2,3,4,5] (días válidos 0=Dom … 6=Sáb, sin duplicados, ordenados).
export function parseWorkDays(s: string): number[] {
  const ds = s
    .split(",")
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return ds.length ? [...new Set(ds)].sort((a, b) => a - b) : [...MARCEBOT_DEFAULTS.workDays];
}

export async function getMarcebotConfig(): Promise<MarcebotConfig> {
  const row = await db.marcebotConfig.findUnique({ where: { id: "default" } });
  if (!row) return { ...MARCEBOT_DEFAULTS };
  return {
    enabled: row.enabled,
    workDays: parseWorkDays(row.workDays),
    startHour: row.startHour,
    lastHour: row.lastHour,
  };
}
