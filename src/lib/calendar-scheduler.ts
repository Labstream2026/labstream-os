import { db } from "@/lib/db";
import { syncAllCalendars } from "@/lib/calendar-sync";
import { CALENDAR_SYNC_DEFAULTS, parseSyncDays } from "@/lib/calendar-sync-config";

// Planificador EN-PROCESO del sondeo de calendarios Synology. Corre dentro del servidor
// Node de la app (lo arranca instrumentation.ts), así la app es la fuente principal y NO
// depende del Programador de tareas del NAS. Cada minuto evalúa la configuración
// (CalendarSyncSettings) y, si toca, llama a syncAllCalendars().
//
// Hora/días se evalúan en zona horaria de Bogotá porque el contenedor corre en UTC.

const TICK_MS = 60_000;

// Hora (0–23) y día de la semana (0=Dom … 6=Sáb) actuales en Bogotá.
function bogotaNow(now: Date): { hour: number; weekday: number } {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "2-digit", hour12: false }).format(now),
  );
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", weekday: "short" }).format(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour: Number.isFinite(hour) ? hour % 24 : 0, weekday: map[wd] ?? 0 };
}

async function tick(): Promise<void> {
  try {
    const row = await db.calendarSyncSettings.findUnique({ where: { id: "default" } });
    const cfg = {
      enabled: row?.enabled ?? CALENDAR_SYNC_DEFAULTS.enabled,
      everyMinutes: Math.max(1, row?.everyMinutes ?? CALENDAR_SYNC_DEFAULTS.everyMinutes),
      startHour: row?.startHour ?? CALENDAR_SYNC_DEFAULTS.startHour,
      endHour: row?.endHour ?? CALENDAR_SYNC_DEFAULTS.endHour,
      workDays: row ? parseSyncDays(row.workDays) : CALENDAR_SYNC_DEFAULTS.workDays,
      lastRunAt: row?.lastRunAt ?? null,
    };
    if (!cfg.enabled) return;

    const now = new Date();
    const { hour, weekday } = bogotaNow(now);
    if (cfg.workDays.length && !cfg.workDays.includes(weekday)) return;
    if (hour < cfg.startHour || hour >= cfg.endHour) return;

    // ¿Ya pasó la frecuencia desde el último sondeo? (evita solapar).
    const elapsed = cfg.lastRunAt ? now.getTime() - new Date(cfg.lastRunAt).getTime() : Infinity;
    if (elapsed < cfg.everyMinutes * 60_000) return;

    // Marca ANTES de sincronizar para que dos ticks no lo lancen a la vez.
    await db.calendarSyncSettings.upsert({
      where: { id: "default" },
      create: { id: "default", lastRunAt: now },
      update: { lastRunAt: now },
    });
    await syncAllCalendars();
  } catch {
    // best-effort: un fallo de sondeo no debe tumbar el planificador
  }
}

// Arranca el planificador una sola vez por proceso (guard en globalThis para sobrevivir al
// HMR en desarrollo). Idempotente.
export function startCalendarScheduler(): void {
  const g = globalThis as unknown as { __labstreamCalSched?: NodeJS.Timeout };
  if (g.__labstreamCalSched) return;
  // Primer sondeo a los 30 s del arranque; luego cada minuto.
  setTimeout(() => void tick(), 30_000);
  g.__labstreamCalSched = setInterval(() => void tick(), TICK_MS);
}
