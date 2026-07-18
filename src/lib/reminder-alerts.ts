import { db } from "@/lib/db";
import { bogotaYmd, eventAnchorInstant, taskAnchorInstant } from "@/lib/reminder-schedule";

// ── Avisos de un recordatorio (capa de BD) ──
// Un recordatorio (el "qué") tiene uno o varios ReminderAlert (los "cuándo"). Este módulo
// materializa/recalcula esos avisos. La matemática pura de recurrencia vive en
// `reminder-schedule.ts`; aquí solo se toca la base.

const GRACE_MS = 60_000; // un aviso "del pasado inmediato" (≤1 min) todavía cuenta como vigente

// Deja `nextFireAt` del recordatorio en el próximo aviso pendiente (para ordenar/mostrar).
// No toca `active` (eso lo gobiernan pausar/reactivar y el agotamiento en el barrido).
export async function recomputeReminderNext(reminderId: string): Promise<void> {
  const next = await db.reminderAlert.findFirst({
    where: { reminderId, active: true, sentAt: null },
    orderBy: { fireAt: "asc" },
    select: { fireAt: true },
  });
  if (next) {
    await db.reminder.update({ where: { id: reminderId }, data: { nextFireAt: next.fireAt } });
  }
}

// ¿Sigue pendiente algún aviso? (para decidir si el recordatorio ya se agotó).
export async function hasPendingAlerts(reminderId: string): Promise<boolean> {
  const n = await db.reminderAlert.count({ where: { reminderId, active: true, sentAt: null } });
  return n > 0;
}

// ¿La recurrencia permite otro disparo? (tras `firedCountAfter` disparos, cayendo en `candidate`).
export function recurrenceAllows(
  r: { untilYmd: string | null; maxFires: number | null },
  firedCountAfter: number,
  candidate: Date,
): boolean {
  if (r.maxFires != null && firedCountAfter >= r.maxFires) return false;
  if (r.untilYmd && bogotaYmd(candidate) > r.untilYmd) return false;
  return true;
}

// ── Recalcular avisos RELATIVOS al mover/borrar su ancla (cita o tarea) ──
// Los avisos con `offsetMin` cuelgan del inicio de la cita/tarea; si esta se mueve, se
// recalcula su `fireAt` y se reabren (sentAt=null) para volver a sonar en el nuevo horario.

async function syncAnchoredAlerts(reminderId: string, anchor: Date, doneAt: Date | null): Promise<void> {
  const now = Date.now();
  const relatives = await db.reminderAlert.findMany({
    where: { reminderId, offsetMin: { not: null } },
    select: { id: true, offsetMin: true },
  });
  for (const a of relatives) {
    const fireAt = new Date(anchor.getTime() - (a.offsetMin ?? 0) * 60_000);
    await db.reminderAlert.update({
      where: { id: a.id },
      data: { fireAt, sentAt: null, active: fireAt.getTime() > now - GRACE_MS },
    });
  }
  if (relatives.length) {
    if (!doneAt) await db.reminder.update({ where: { id: reminderId }, data: { active: true } }).catch(() => {});
    await recomputeReminderNext(reminderId);
  }
}

// Cita movida/editada → recalcula los avisos "X antes" de todos los recordatorios atados.
export async function syncEventAnchoredAlerts(eventId: string): Promise<void> {
  const ev = await db.calendarEvent.findUnique({ where: { id: eventId }, select: { start: true } });
  if (!ev) return;
  const anchor = eventAnchorInstant(ev.start);
  const rems = await db.reminder.findMany({ where: { eventId }, select: { id: true, doneAt: true } });
  for (const r of rems) await syncAnchoredAlerts(r.id, anchor, r.doneAt);
}

// Cita a punto de borrarse → apaga sus avisos relativos (el FK se pone en null al borrar).
export async function disableEventAnchoredAlerts(eventId: string): Promise<void> {
  const rems = await db.reminder.findMany({ where: { eventId }, select: { id: true } });
  for (const r of rems) {
    await db.reminderAlert.updateMany({ where: { reminderId: r.id, offsetMin: { not: null } }, data: { active: false } });
    if (!(await hasPendingAlerts(r.id))) {
      await db.reminder.update({ where: { id: r.id }, data: { active: false } }).catch(() => {});
    } else {
      await recomputeReminderNext(r.id);
    }
  }
}

// ── Acciones puntuales (compartidas por server-actions y el endpoint del push) ──

// Marca un recordatorio como HECHO: lo apaga y guarda la fecha (historial). Apaga sus avisos
// pendientes para que no vuelva a sonar.
export async function markReminderDone(reminderId: string): Promise<void> {
  await db.reminder.update({ where: { id: reminderId }, data: { doneAt: new Date(), active: false } });
  await db.reminderAlert.updateMany({ where: { reminderId, sentAt: null }, data: { active: false } });
}

// Posponer: mueve el PRÓXIMO aviso pendiente al instante `target` (o crea uno si ya sonaron
// todos — "recuérdamelo otra vez"). Reactiva el recordatorio.
export async function snoozeReminderTo(reminderId: string, target: Date): Promise<void> {
  const a = await db.reminderAlert.findFirst({
    where: { reminderId, active: true, sentAt: null },
    orderBy: { fireAt: "asc" },
    select: { id: true },
  });
  if (a) await db.reminderAlert.update({ where: { id: a.id }, data: { fireAt: target, active: true } });
  else await db.reminderAlert.create({ data: { reminderId, fireAt: target } });
  await db.reminder.update({ where: { id: reminderId }, data: { active: true, doneAt: null } });
  await recomputeReminderNext(reminderId);
}

// Tarea reprogramada (fecha/hora) → recalcula los avisos "X antes" de los recordatorios atados.
export async function syncTaskAnchoredAlerts(taskId: string): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { dueDate: true, dueTime: true } });
  if (!task?.dueDate) return;
  const anchor = taskAnchorInstant(task.dueDate.toISOString(), task.dueTime);
  const rems = await db.reminder.findMany({
    where: { taskId, alerts: { some: { offsetMin: { not: null } } } },
    select: { id: true, doneAt: true },
  });
  for (const r of rems) await syncAnchoredAlerts(r.id, anchor, r.doneAt);
}
