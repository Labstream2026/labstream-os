"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { nextFire, utcFromBogota, describeSchedule, isValidTime, isValidYmd, type ReminderSchedule } from "@/lib/reminder-schedule";

// ── Acciones de recordatorios ──
// Cualquiera del equipo puede crear recordatorios propios o para un compañero (como quien
// deja una nota en el escritorio de otro). El portal del cliente y el usuario demo NO:
// los recordatorios son una herramienta interna.

type Res = { ok: boolean; error?: string };

const FREQUENCIES = new Set(["UNA_VEZ", "DIARIO", "SEMANAL", "MENSUAL"]);

async function teamSession() {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo") return null;
  return session;
}

// ¿Puede gestionar (pausar/eliminar) este recordatorio? El creador, el destinatario o un admin.
function canManage(r: { forUserId: string; createdById: string }, session: { id: string; role: string }): boolean {
  return r.forUserId === session.id || r.createdById === session.id || session.role === "admin";
}

export type NewReminderInput = {
  title: string;
  notes?: string;
  forUserId?: string; // por defecto, uno mismo
  taskId?: string; // opcional: colgarlo de una tarea
  frequency: string; // UNA_VEZ | DIARIO | SEMANAL | MENSUAL
  date?: string; // YYYY-MM-DD (solo UNA_VEZ)
  timeOfDay: string; // "HH:mm" hora de Bogotá
  weekdays?: number[]; // 0=domingo (solo SEMANAL)
  dayOfMonth?: number; // 1..31 (solo MENSUAL)
};

export async function createReminder(input: NewReminderInput): Promise<Res> {
  const session = await teamSession();
  if (!session) return { ok: false, error: "Sin permiso" };

  const title = (input.title ?? "").trim().slice(0, 200);
  if (!title) return { ok: false, error: "Escribe qué hay que recordar" };
  const notes = (input.notes ?? "").trim().slice(0, 500) || null;
  const frequency = input.frequency;
  if (!FREQUENCIES.has(frequency)) return { ok: false, error: "Frecuencia inválida" };
  if (!isValidTime(input.timeOfDay)) return { ok: false, error: "Hora inválida" };

  const schedule: ReminderSchedule = {
    frequency,
    weekdays: frequency === "SEMANAL" ? (input.weekdays ?? []).filter((d) => d >= 0 && d <= 6).join(",") : null,
    dayOfMonth: frequency === "MENSUAL" ? input.dayOfMonth ?? null : null,
    timeOfDay: input.timeOfDay,
  };

  // Primer disparo: instante explícito (una vez) o el próximo que toque (recurrente).
  const now = new Date();
  let nextFireAt: Date;
  if (frequency === "UNA_VEZ") {
    if (!input.date || !isValidYmd(input.date)) return { ok: false, error: "Fecha inválida" };
    nextFireAt = utcFromBogota(input.date, input.timeOfDay);
    if (nextFireAt.getTime() < now.getTime() - 60_000) return { ok: false, error: "Ese momento ya pasó" };
  } else {
    if (frequency === "SEMANAL" && !schedule.weekdays) return { ok: false, error: "Elige al menos un día de la semana" };
    if (frequency === "MENSUAL" && (!schedule.dayOfMonth || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31)) {
      return { ok: false, error: "Elige un día del mes (1-31)" };
    }
    const next = nextFire(schedule, now);
    if (!next) return { ok: false, error: "La regla no genera ningún disparo" };
    nextFireAt = next;
  }

  // Destinatario: uno mismo por defecto; si es otro, debe ser una persona real del equipo.
  const forUserId = input.forUserId || session.id;
  if (forUserId !== session.id) {
    const target = await db.user.findUnique({ where: { id: forUserId }, select: { active: true, isSystemBot: true } });
    if (!target || !target.active || target.isSystemBot) return { ok: false, error: "Destinatario inválido" };
  }

  // Tarea opcional: solo validamos que exista (herramienta interna del equipo).
  let taskId: string | null = null;
  if (input.taskId) {
    const task = await db.task.findUnique({ where: { id: input.taskId }, select: { id: true } });
    if (!task) return { ok: false, error: "La tarea ya no existe" };
    taskId = task.id;
  }

  await db.reminder.create({
    data: {
      title,
      notes,
      forUserId,
      createdById: session.id,
      taskId,
      frequency,
      weekdays: schedule.weekdays,
      dayOfMonth: schedule.dayOfMonth,
      timeOfDay: input.timeOfDay,
      nextFireAt,
    },
  });

  // Si es para otra persona, se le avisa de una vez (con el avatar de quien lo dejó).
  if (forUserId !== session.id) {
    const creator = await db.user.findUnique({ where: { id: session.id }, select: { name: true } });
    await notify(forUserId, {
      type: "reminder",
      event: "reminder_assigned",
      title: `${creator?.name ?? "Alguien"} te dejó un recordatorio`,
      body: `${title} · ${frequency === "UNA_VEZ" ? `${input.date} ${input.timeOfDay}` : describeSchedule(schedule)}`,
      link: "/recordatorios",
      actorId: session.id,
    }).catch(() => {});
  }

  revalidatePath("/recordatorios");
  return { ok: true };
}

// Pausar / reactivar. Al reactivar un recurrente se recalcula el próximo disparo; un "una vez"
// cuyo momento ya pasó no se puede reactivar (mejor crear uno nuevo).
export async function toggleReminder(id: string, active: boolean): Promise<Res> {
  const session = await teamSession();
  if (!session) return { ok: false, error: "Sin permiso" };
  const r = await db.reminder.findUnique({ where: { id } });
  if (!r || !canManage(r, session)) return { ok: false, error: "Sin permiso" };

  if (active) {
    if (r.frequency === "UNA_VEZ") {
      if (r.nextFireAt.getTime() < Date.now()) return { ok: false, error: "Ese momento ya pasó; crea uno nuevo" };
      await db.reminder.update({ where: { id }, data: { active: true } });
    } else {
      const next = nextFire(r, new Date());
      if (!next) return { ok: false, error: "La regla no genera ningún disparo" };
      await db.reminder.update({ where: { id }, data: { active: true, nextFireAt: next } });
    }
  } else {
    await db.reminder.update({ where: { id }, data: { active: false } });
  }
  revalidatePath("/recordatorios");
  return { ok: true };
}

export async function deleteReminder(id: string): Promise<Res> {
  const session = await teamSession();
  if (!session) return { ok: false, error: "Sin permiso" };
  const r = await db.reminder.findUnique({ where: { id }, select: { forUserId: true, createdById: true } });
  if (!r || !canManage(r, session)) return { ok: false, error: "Sin permiso" };
  await db.reminder.delete({ where: { id } });
  revalidatePath("/recordatorios");
  return { ok: true };
}

// Recordatorios de una tarea (para el panel de detalle en Mis tareas).
export type TaskReminderItem = {
  id: string;
  title: string;
  schedule: string; // etiqueta humana ("Una vez · 2026-07-08 08:00" / "Cada semana · lun · 8:00")
  nextFireAtIso: string;
  forUserName: string;
  active: boolean;
  canManage: boolean;
};

export async function getTaskReminders(taskId: string): Promise<TaskReminderItem[]> {
  const session = await teamSession();
  if (!session) return [];
  const rows = await db.reminder.findMany({
    where: { taskId, active: true },
    orderBy: { nextFireAt: "asc" },
    include: { forUser: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    schedule: r.frequency === "UNA_VEZ" ? "Una vez" : describeSchedule(r),
    nextFireAtIso: r.nextFireAt.toISOString(),
    forUserName: r.forUser.name,
    active: r.active,
    canManage: canManage(r, session),
  }));
}
