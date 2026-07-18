import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { nextFire } from "@/lib/reminder-schedule";
import { recomputeReminderNext, recurrenceAllows } from "@/lib/reminder-alerts";

// ── Barrido de recordatorios ──
// Recorre los AVISOS (ReminderAlert) cuyo `fireAt` ya pasó y dispara la notificación (campana +
// push, según preferencias del usuario). Un recordatorio puede tener varios avisos (hoy y
// mañana; mañana 8, 9 y 10); cada uno es una fila que se dispara y se apaga por su cuenta.
// Se invoca desde DOS lados, sin cron nuevo en el NAS:
//  1. /api/notifications (el sondeo de la campana, cada ~20 s mientras alguien usa la app).
//  2. /api/cron/marcebot (cada 2 h) y /api/cron/reminders → respaldo de madrugada/fines.
//
// Carreras: cada disparo se RECLAMA con un updateMany condicionado a `sentAt: null`; si dos
// barridos coinciden, solo uno logra el update (count=1) y solo ese notifica.

let lastSweepAt = 0;
const SWEEP_THROTTLE_MS = 30_000;

export type SweepSummary = { checked: number; fired: number };

export async function sweepReminders(opts: { force?: boolean; now?: Date } = {}): Promise<SweepSummary | null> {
  const now = opts.now ?? new Date();
  if (!opts.force && Date.now() - lastSweepAt < SWEEP_THROTTLE_MS) return null;
  lastSweepAt = Date.now();

  const due = await db.reminderAlert.findMany({
    where: { active: true, sentAt: null, fireAt: { lte: now }, reminder: { active: true, doneAt: null } },
    take: 100,
    orderBy: { fireAt: "asc" },
    include: {
      reminder: {
        include: { task: { select: { id: true, title: true } }, event: { select: { id: true, title: true } } },
      },
    },
  });

  let fired = 0;
  for (const a of due) {
    // Reclamo atómico: apaga el aviso (no volverá a barrerse) solo si aún estaba pendiente.
    const claimed = await db.reminderAlert.updateMany({
      where: { id: a.id, sentAt: null },
      data: { sentAt: now, active: false },
    });
    if (claimed.count !== 1) continue; // otro barrido lo tomó primero

    fired++;
    const r = a.reminder;
    await notify(r.forUserId, {
      type: "reminder",
      event: "reminder_fire",
      title: `⏰ ${r.title}`,
      body:
        [r.task ? `Tarea: ${r.task.title}` : null, r.event ? `Cita: ${r.event.title}` : null, r.notes]
          .filter(Boolean)
          .join(" · ") || undefined,
      link: r.task ? "/mis-tareas" : r.event ? "/calendario" : "/recordatorios",
      // Si el recordatorio lo dejó otra persona, la campana muestra su avatar/color.
      actorId: r.createdById,
      // Responsable: aunque sea un recordatorio propio (sin actor), se pinta con el color de
      // quien lo dejó → sabes "de quién es" en la campana.
      subjectId: r.createdById,
      // Botones de acción en el push (service worker): posponer / marcar hecho.
      push: { reminderId: r.id, snooze: true },
    }).catch(() => {});

    // Recurrente (aviso de hora fija, no relativo) → materializa el próximo, si la regla no
    // llegó a su fin (untilYmd/maxFires). Si no, el recordatorio se agota.
    let regenerated = false;
    if (r.frequency !== "UNA_VEZ" && a.offsetMin == null) {
      const next = nextFire(
        { frequency: r.frequency, weekdays: r.weekdays, dayOfMonth: r.dayOfMonth, timeOfDay: r.timeOfDay },
        now,
      );
      if (next && recurrenceAllows(r, r.firedCount + 1, next)) {
        await db.reminderAlert.create({ data: { reminderId: r.id, fireAt: next } });
        await db.reminder.update({
          where: { id: r.id },
          data: { firedCount: { increment: 1 }, lastFiredAt: now, nextFireAt: next },
        });
        regenerated = true;
      }
    }

    if (!regenerated) {
      await db.reminder.update({ where: { id: r.id }, data: { firedCount: { increment: 1 }, lastFiredAt: now } });
      // ¿Quedan avisos pendientes? Si no, el recordatorio se apaga (una vez agotado).
      const pending = await db.reminderAlert.count({ where: { reminderId: r.id, active: true, sentAt: null } });
      if (pending === 0) await db.reminder.update({ where: { id: r.id }, data: { active: false } });
      else await recomputeReminderNext(r.id);
    }
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
  const rows = await db.reminderAlert.findMany({
    where: {
      active: true,
      sentAt: null,
      fireAt: { gte: now, lt: until },
      reminder: { forUserId: userId, active: true, doneAt: null },
    },
    orderBy: { fireAt: "asc" },
    take: 8,
    select: { fireAt: true, reminder: { select: { id: true, title: true, task: { select: { title: true } } } } },
  });
  return rows.map((a) => ({ id: a.reminder.id, title: a.reminder.title, at: a.fireAt, taskTitle: a.reminder.task?.title ?? null }));
}
