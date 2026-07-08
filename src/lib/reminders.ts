import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { nextFire } from "@/lib/reminder-schedule";

// ── Barrido de recordatorios ──
// Busca los recordatorios cuyo `nextFireAt` ya pasó y les dispara la notificación (campana +
// push, según preferencias del usuario). Se invoca desde DOS lados, sin cron nuevo en el NAS:
//  1. /api/notifications (el sondeo de la campana, cada ~20 s mientras alguien usa la app) →
//     precisión casi en tiempo real en horario laboral. Con throttle para no barrer por cada
//     pestaña abierta.
//  2. /api/cron/marcebot (cada 2 h) y /api/cron/reminders → respaldo cuando no hay nadie
//     conectado (madrugada, fines de semana).
//
// Seguridad ante carreras: el contenedor es uno solo, pero igual cada disparo se RECLAMA con
// un updateMany condicionado al nextFireAt leído — si dos barridos coinciden, solo uno logra
// el update (count=1) y solo ese envía la notificación.

let lastSweepAt = 0;
const SWEEP_THROTTLE_MS = 30_000;

export type SweepSummary = { checked: number; fired: number };

export async function sweepReminders(opts: { force?: boolean; now?: Date } = {}): Promise<SweepSummary | null> {
  const now = opts.now ?? new Date();
  if (!opts.force && Date.now() - lastSweepAt < SWEEP_THROTTLE_MS) return null;
  lastSweepAt = Date.now();

  const due = await db.reminder.findMany({
    where: { active: true, nextFireAt: { lte: now } },
    take: 100,
    include: { task: { select: { id: true, title: true } } },
  });

  let fired = 0;
  for (const r of due) {
    // Recurrente → siguiente instante; una vez → se apaga. El disparo atrasado (p. ej. el cron
    // de las 6:00 despacha uno de las 5:30) se envía igual: mejor tarde que nunca.
    const next = nextFire(r, now);
    const claimed = await db.reminder.updateMany({
      where: { id: r.id, active: true, nextFireAt: r.nextFireAt },
      data: next ? { nextFireAt: next, lastFiredAt: now } : { active: false, lastFiredAt: now },
    });
    if (claimed.count !== 1) continue; // otro barrido lo reclamó primero

    fired++;
    await notify(r.forUserId, {
      type: "reminder",
      event: "reminder_fire",
      title: `⏰ ${r.title}`,
      body: [r.task ? `Tarea: ${r.task.title}` : null, r.notes].filter(Boolean).join(" · ") || undefined,
      link: r.task ? "/mis-tareas" : "/recordatorios",
      // Si el recordatorio lo dejó otra persona, la campana muestra su avatar/color.
      actorId: r.createdById,
    }).catch(() => {});
  }
  return { checked: due.length, fired };
}

// ── Próximos recordatorios de un usuario (para Marcebot: tarjeta del Inicio y digest) ──
export type UpcomingReminder = { id: string; title: string; at: Date; taskTitle: string | null };

export async function getUpcomingReminders(
  userId: string,
  now: Date = new Date(),
  hours = 36,
): Promise<UpcomingReminder[]> {
  const until = new Date(now.getTime() + hours * 3_600_000);
  const rows = await db.reminder.findMany({
    where: { forUserId: userId, active: true, nextFireAt: { gte: now, lt: until } },
    orderBy: { nextFireAt: "asc" },
    take: 8,
    select: { id: true, title: true, nextFireAt: true, task: { select: { title: true } } },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, at: r.nextFireAt, taskTitle: r.task?.title ?? null }));
}
