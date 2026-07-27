"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { nextFire, utcFromBogota, bogotaYmd, isValidTime, isValidYmd, describeSchedule } from "@/lib/reminder-schedule";

// ── El recordatorio de una nota, de verdad ──
// Antes, la campanita de una nota solo escribía `Note.remindAt`: un aviso de segunda que no
// salía en /recordatorios, no se podía posponer ni marcar hecho, no se repetía, no se le
// podía dejar a nadie y al sonar te dejaba en la lista de notas sin abrir la nota.
//
// Ahora crea un `Reminder` normal atado a la nota (`noteId`). Con eso hereda GRATIS todo lo
// que ya sabe hacer el sistema de recordatorios: posponer, marcar hecho, repetir, varios
// avisos, dejárselo a un compañero (desde /recordatorios) y un push con botones. Y el aviso
// abre la nota.
//
// `Note.remindAt` se sigue guardando, pero solo como ESPEJO para pintar el chip en la lista;
// `reminderSentAt` se marca a la vez para que el barrido antiguo no dispare por duplicado.
// Las notas viejas que solo tienen `remindAt` siguen funcionando con ese barrido.

const FREQUENCIES = new Set(["UNA_VEZ", "DIARIO", "SEMANAL", "MENSUAL"]);

export type NoteReminder = {
  id: string;
  whenIso: string; // próximo aviso (UTC)
  frequency: string;
  label: string; // «una vez» / «cada día» / …
};

// Recordatorio vigente de una nota para quien lo mira (el más próximo, sin marcar hecho).
async function activeReminder(noteId: string, userId: string) {
  return db.reminder.findFirst({
    where: { noteId, forUserId: userId, active: true, doneAt: null },
    orderBy: { nextFireAt: "asc" },
    select: { id: true, nextFireAt: true, frequency: true, weekdays: true, dayOfMonth: true, timeOfDay: true },
  });
}

function labelOf(frequency: string, weekdays: string | null, dayOfMonth: number | null, timeOfDay: string): string {
  return frequency === "UNA_VEZ" ? "una vez" : describeSchedule({ frequency, weekdays, dayOfMonth, timeOfDay });
}

// Pone (o cambia) el recordatorio de una nota. `date`/`time` son hora de pared de Bogotá.
export async function setNoteReminder(
  noteId: string,
  input: { date: string; time: string; frequency?: string },
): Promise<{ ok: boolean; error?: string; reminder?: NoteReminder }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  if (session.role === "cliente" || session.role === "demo") return { ok: false, error: "Sin permiso para crear recordatorios" };

  const note = await db.note.findUnique({ where: { id: noteId }, select: { title: true, content: true, createdById: true, archivedAt: true } });
  if (!note || note.archivedAt) return { ok: false, error: "La nota no existe" };
  if (note.createdById !== session.id && session.role !== "admin") return { ok: false, error: "No autorizado" };

  const date = (input.date ?? "").trim();
  const time = (input.time ?? "").trim();
  if (!isValidYmd(date)) return { ok: false, error: "Fecha inválida" };
  if (!isValidTime(time)) return { ok: false, error: "Hora inválida" };
  const frequency = input.frequency && FREQUENCIES.has(input.frequency) ? input.frequency : "UNA_VEZ";

  // Momento elegido y, si se repite, la regla (semanal hereda el día de la semana elegido;
  // mensual, el día del mes).
  const chosen = utcFromBogota(date, time);
  const weekdays = frequency === "SEMANAL" ? String(new Date(`${date}T12:00:00.000Z`).getUTCDay()) : null;
  const dayOfMonth = frequency === "MENSUAL" ? Number(date.slice(8, 10)) : null;
  const fireAt =
    frequency === "UNA_VEZ"
      ? chosen
      : nextFire({ frequency, weekdays, dayOfMonth, timeOfDay: time }, new Date(chosen.getTime() - 1)) ?? chosen;

  const title = note.title.slice(0, 200) || "Nota";
  const notes = note.content.trim().replace(/\s+/g, " ").slice(0, 200) || null;

  const existing = await activeReminder(noteId, session.id);
  if (existing) {
    // Se reemplazan los avisos del recordatorio (mismo destinatario, misma nota).
    await db.reminderAlert.deleteMany({ where: { reminderId: existing.id } });
    await db.reminder.update({
      where: { id: existing.id },
      data: { title, notes, frequency, weekdays, dayOfMonth, timeOfDay: time, nextFireAt: fireAt, active: true, doneAt: null },
    });
    await db.reminderAlert.create({ data: { reminderId: existing.id, fireAt } });
    await syncMirror(noteId, fireAt);
    revalidatePath("/notas");
    revalidatePath("/recordatorios");
    return { ok: true, reminder: { id: existing.id, whenIso: fireAt.toISOString(), frequency, label: labelOf(frequency, weekdays, dayOfMonth, time) } };
  }

  const rem = await db.reminder.create({
    data: {
      title,
      notes,
      forUserId: session.id,
      createdById: session.id,
      noteId,
      frequency,
      weekdays,
      dayOfMonth,
      timeOfDay: time,
      nextFireAt: fireAt,
      // Emoji, NO un token «ls:…»: esos son las marcas de sector/proyecto y aquí se
      // pintarían como texto crudo en la lista de recordatorios.
      icon: "📝",
    },
  });
  await db.reminderAlert.create({ data: { reminderId: rem.id, fireAt } });
  await syncMirror(noteId, fireAt);
  await logActivity({ action: "reminder.create", summary: `puso un recordatorio a la nota «${title}»`, entityType: "reminder", entityId: rem.id, silent: true }).catch(() => null);
  revalidatePath("/notas");
  revalidatePath("/recordatorios");
  return { ok: true, reminder: { id: rem.id, whenIso: fireAt.toISOString(), frequency, label: labelOf(frequency, weekdays, dayOfMonth, time) } };
}

// Quita el recordatorio de la nota (el de quien lo mira).
export async function clearNoteReminder(noteId: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const note = await db.note.findUnique({ where: { id: noteId }, select: { createdById: true } });
  if (!note) return { ok: false };
  if (note.createdById !== session.id && session.role !== "admin") return { ok: false };
  await db.reminder.deleteMany({ where: { noteId, forUserId: session.id } });
  await syncMirror(noteId, null);
  revalidatePath("/notas");
  revalidatePath("/recordatorios");
  return { ok: true };
}

// Espejo en la nota: `remindAt` alimenta el chip de la lista y `reminderSentAt` se marca a la
// vez para que el barrido ANTIGUO (dispatchDueNoteReminders) nunca dispare por duplicado.
async function syncMirror(noteId: string, fireAt: Date | null): Promise<void> {
  await db.note.update({
    where: { id: noteId },
    data: { remindAt: fireAt, reminderSentAt: fireAt ? new Date() : null },
  }).catch(() => null);
}

// Estado del recordatorio de una nota (para pintar la campanita al abrirla).
export async function getNoteReminder(noteId: string): Promise<NoteReminder | null> {
  const session = await getSession();
  if (!session) return null;
  const r = await activeReminder(noteId, session.id);
  if (!r) return null;
  return {
    id: r.id,
    whenIso: r.nextFireAt.toISOString(),
    frequency: r.frequency,
    label: labelOf(r.frequency, r.weekdays, r.dayOfMonth, r.timeOfDay),
  };
}

// Día de Bogotá de hoy: lo usa el editor para no ofrecer fechas pasadas por defecto.
export async function bogotaToday(): Promise<string> {
  return bogotaYmd(new Date());
}
