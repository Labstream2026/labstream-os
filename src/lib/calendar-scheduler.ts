import { db } from "@/lib/db";
import { syncAllCalendars } from "@/lib/calendar-sync";
import { CALENDAR_SYNC_DEFAULTS, parseSyncDays } from "@/lib/calendar-sync-config";
import { notifyMany } from "@/lib/notify";

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

// ── Recordatorios de citas (🔔 «empieza en N minutos») ──
// Cada tick busca citas con recordatorio configurado cuyo aviso YA toca y aún no se
// disparó, y notifica (in-app + push del navegador) a todos los asistentes que NO
// declinaron. Convención de fechas: la hora guardada es "de pared en UTC" → el instante
// real es start + 5 h; comparamos contra el "ahora de pared" (now - 5 h).
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const MAX_REMINDER_MIN = 1440;

async function fireEventReminders(now: Date): Promise<void> {
  const nowWall = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  // Candidatas: empiezan dentro de la ventana máxima de recordatorio y no han empezado.
  const horizon = new Date(nowWall.getTime() + MAX_REMINDER_MIN * 60_000);
  const events = await db.calendarEvent.findMany({
    where: {
      allDay: false,
      reminderSentAt: null,
      reminderMinutes: { not: null },
      start: { gt: nowWall, lte: horizon },
    },
    select: {
      id: true, title: true, start: true, location: true, reminderMinutes: true,
      attendees: { select: { userId: true, status: true } },
    },
    take: 100,
  });
  for (const ev of events) {
    const mins = ev.reminderMinutes ?? 15;
    // ¿Ya toca? (faltan <= mins minutos para el inicio)
    if (ev.start.getTime() - nowWall.getTime() > mins * 60_000) continue;
    // Marca ANTES de notificar (anti-duplicado si dos ticks se solapan).
    const claimed = await db.calendarEvent.updateMany({
      where: { id: ev.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (claimed.count === 0) continue; // otro tick lo tomó
    const faltan = Math.max(1, Math.round((ev.start.getTime() - nowWall.getTime()) / 60_000));
    const hora = ev.start.toISOString().slice(11, 16);
    const recipients = ev.attendees.filter((a) => a.status !== "DECLINED").map((a) => a.userId);
    if (!recipients.length) continue;
    await notifyMany(recipients, {
      type: "event",
      event: "calendar_event",
      title: `🔔 «${ev.title}» empieza en ${faltan} min`,
      body: `A las ${hora}${ev.location ? ` · ${ev.location}` : ""}`,
      link: "/calendario",
    }).catch(() => null);
  }
}

async function tick(): Promise<void> {
  // Los recordatorios corren en CADA tick (60 s), sin depender de la franja/frecuencia
  // del sondeo CalDAV: una cita de las 7 p. m. también merece su aviso.
  try {
    await fireEventReminders(new Date());
  } catch {
    /* best-effort */
  }
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
