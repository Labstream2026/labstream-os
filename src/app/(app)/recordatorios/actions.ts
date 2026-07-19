"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { canAccessProject } from "@/lib/project-access";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notify";
import {
  nextFire,
  utcFromBogota,
  bogotaYmd,
  ymdPlus,
  describeSchedule,
  isValidTime,
  isValidYmd,
  isValidPriority,
  REMINDER_COLOR_KEYS,
  eventAnchorInstant,
  taskAnchorInstant,
  type ReminderSchedule,
} from "@/lib/reminder-schedule";
import { markReminderDone, snoozeReminderTo, recomputeReminderNext } from "@/lib/reminder-alerts";
import { logActivity } from "@/lib/activity";

// ── Acciones de recordatorios ──
// Cualquiera del equipo puede crear recordatorios propios o para uno/varios compañeros (como
// quien deja una nota en el escritorio de otro, o le encarga "hacer estiramiento"). El portal
// del cliente y el usuario demo NO: los recordatorios son una herramienta interna.

type Res = { ok: boolean; error?: string };

const FREQUENCIES = new Set(["UNA_VEZ", "DIARIO", "SEMANAL", "MENSUAL"]);

async function teamSession() {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo") return null;
  return session;
}

// ¿Puede gestionar (editar/pausar/eliminar) este recordatorio? El creador, el destinatario o un admin.
function canManage(r: { forUserId: string; createdById: string }, session: { id: string; role: string }): boolean {
  return r.forUserId === session.id || r.createdById === session.id || session.role === "admin";
}

export type ReminderAlertInput = { date: string; time: string }; // aviso de hora fija

export type NewReminderInput = {
  title: string;
  notes?: string;
  icon?: string | null;
  color?: string | null;
  priority?: number;
  // Destinatarios: uno mismo por defecto; varios = "asignar al equipo". (forUserId: compat.)
  forUserId?: string;
  forUserIds?: string[];
  // Atar a una tarea o cita (etiqueta y, si hay `offsets`, ancla de los avisos relativos).
  taskId?: string | null;
  eventId?: string | null;
  frequency: string; // UNA_VEZ | DIARIO | SEMANAL | MENSUAL
  // Avisos de hora fija (UNA_VEZ): uno o varios. (date/timeOfDay sueltos: compat panel de tareas.)
  alerts?: ReminderAlertInput[];
  date?: string;
  timeOfDay?: string;
  // Recurrencia.
  weekdays?: number[];
  dayOfMonth?: number;
  untilYmd?: string | null;
  maxFires?: number | null;
  // Avisos relativos al ancla: minutos antes del inicio (p. ej. [15, 1440]).
  offsets?: number[];
};

type AlertSpec = { fireAt: Date; offsetMin: number | null };

type Resolved =
  | {
      ok: true;
      title: string;
      notes: string | null;
      icon: string | null;
      color: string | null;
      priority: number;
      taskId: string | null;
      eventId: string | null;
      frequency: string;
      weekdays: string | null;
      dayOfMonth: number | null;
      timeOfDay: string;
      untilYmd: string | null;
      maxFires: number | null;
      specs: AlertSpec[];
      nextFireAt: Date;
    }
  | { ok: false; error: string };

// Normaliza + valida la entrada y calcula los avisos concretos (fixed / recurrente / relativo).
// Compartido por crear y editar. No toca destinatarios (eso lo maneja cada acción).
async function resolveReminder(input: NewReminderInput, now: Date): Promise<Resolved> {
  const title = (input.title ?? "").trim().slice(0, 200);
  if (!title) return { ok: false, error: "Escribe qué hay que recordar" };
  const notes = (input.notes ?? "").trim().slice(0, 500) || null;
  const icon = (input.icon ?? "").trim().slice(0, 60) || null;
  const color = input.color && REMINDER_COLOR_KEYS.includes(input.color) ? input.color : null;
  const priority = isValidPriority(input.priority) ? input.priority : 1;
  const frequency = input.frequency || "UNA_VEZ";
  if (!FREQUENCIES.has(frequency)) return { ok: false, error: "Frecuencia inválida" };

  // Ancla opcional (tarea o cita) — sirve de etiqueta y, con `offsets`, de referencia.
  const taskId = input.taskId || null;
  const eventId = input.eventId || null;
  let task: { dueDate: Date | null; dueTime: string | null } | null = null;
  let event: { start: Date } | null = null;
  if (taskId) {
    task = await db.task.findUnique({ where: { id: taskId }, select: { dueDate: true, dueTime: true } });
    if (!task) return { ok: false, error: "La tarea ya no existe" };
  }
  if (eventId) {
    event = await db.calendarEvent.findUnique({ where: { id: eventId }, select: { start: true } });
    if (!event) return { ok: false, error: "La cita ya no existe" };
  }

  const offsets = (input.offsets ?? []).filter((m) => Number.isInteger(m) && m >= 0 && m <= 43_200); // ≤ 30 días
  let storedFrequency = frequency;
  let weekdays: string | null = null;
  let dayOfMonth: number | null = null;
  let timeOfDay = input.timeOfDay && isValidTime(input.timeOfDay) ? input.timeOfDay : "08:00";
  let untilYmd: string | null = null;
  let maxFires: number | null = null;
  let specs: AlertSpec[] = [];

  if (offsets.length && (event || task)) {
    // ── Relativo a la tarea/cita: "X min/horas/días antes" ──
    let anchor: Date;
    if (event) anchor = eventAnchorInstant(event.start);
    else {
      if (!task!.dueDate) return { ok: false, error: "La tarea no tiene fecha; ponle una para avisarte antes" };
      anchor = taskAnchorInstant(task!.dueDate.toISOString(), task!.dueTime);
    }
    storedFrequency = "UNA_VEZ";
    const uniq = [...new Set(offsets)].sort((a, b) => b - a);
    specs = uniq.map((m) => ({ fireAt: new Date(anchor.getTime() - m * 60_000), offsetMin: m }));
    if (!specs.some((s) => s.fireAt.getTime() > now.getTime() - 60_000)) {
      return { ok: false, error: "Esos avisos ya pasaron (la cita/tarea es muy pronto)" };
    }
  } else if (frequency === "UNA_VEZ") {
    // ── Hora fija: uno o varios avisos ──
    const raw: ReminderAlertInput[] =
      input.alerts && input.alerts.length
        ? input.alerts
        : input.date
          ? [{ date: input.date, time: input.timeOfDay || "08:00" }]
          : [];
    const seen = new Set<number>();
    for (const a of raw) {
      if (!a || !isValidYmd(a.date) || !isValidTime(a.time)) continue;
      const f = utcFromBogota(a.date, a.time);
      if (f.getTime() <= now.getTime() - 60_000) continue; // ya pasó
      const key = f.getTime();
      if (seen.has(key)) continue;
      seen.add(key);
      specs.push({ fireAt: f, offsetMin: null });
    }
    if (!specs.length) return { ok: false, error: "Añade al menos un aviso futuro (fecha y hora)" };
  } else {
    // ── Recurrente ──
    if (!isValidTime(timeOfDay)) return { ok: false, error: "Hora inválida" };
    weekdays = frequency === "SEMANAL" ? (input.weekdays ?? []).filter((d) => d >= 0 && d <= 6).join(",") || null : null;
    dayOfMonth = frequency === "MENSUAL" ? (input.dayOfMonth ?? null) : null;
    if (frequency === "SEMANAL" && !weekdays) return { ok: false, error: "Elige al menos un día de la semana" };
    if (frequency === "MENSUAL" && (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 31)) {
      return { ok: false, error: "Elige un día del mes (1-31)" };
    }
    untilYmd = input.untilYmd && isValidYmd(input.untilYmd) ? input.untilYmd : null;
    maxFires = Number.isInteger(input.maxFires) && (input.maxFires as number) >= 1 ? (input.maxFires as number) : null;
    const schedule: ReminderSchedule = { frequency, weekdays, dayOfMonth, timeOfDay };
    const first = nextFire(schedule, now);
    if (!first) return { ok: false, error: "La regla no genera ningún disparo" };
    if (untilYmd && bogotaYmd(first) > untilYmd) return { ok: false, error: "La fecha de fin es anterior al primer aviso" };
    specs = [{ fireAt: first, offsetMin: null }];
  }

  const nextFireAt = new Date(Math.min(...specs.map((s) => s.fireAt.getTime())));
  return {
    ok: true,
    title,
    notes,
    icon,
    color,
    priority,
    taskId,
    eventId,
    frequency: storedFrequency,
    weekdays,
    dayOfMonth,
    timeOfDay,
    untilYmd,
    maxFires,
    specs,
    nextFireAt,
  };
}

// Etiqueta corta para el aviso "te dejé un recordatorio".
function shortWhen(r: Resolved & { ok: true }): string {
  if (r.frequency !== "UNA_VEZ") return describeSchedule({ frequency: r.frequency, weekdays: r.weekdays, dayOfMonth: r.dayOfMonth, timeOfDay: r.timeOfDay });
  return r.specs.length > 1 ? `${r.specs.length} avisos` : `1 aviso`;
}

export async function createReminder(input: NewReminderInput): Promise<Res> {
  const session = await teamSession();
  if (!session) return { ok: false, error: "Sin permiso" };

  const now = new Date();
  const built = await resolveReminder(input, now);
  if (!built.ok) return built;

  // Destinatarios: uno mismo por defecto; varios = asignar a compañeros.
  let recipients = input.forUserIds && input.forUserIds.length ? input.forUserIds : input.forUserId ? [input.forUserId] : [session.id];
  recipients = [...new Set(recipients)].slice(0, 50);
  const others = recipients.filter((id) => id !== session.id);
  if (others.length) {
    const found = await db.user.findMany({ where: { id: { in: others }, active: true, isSystemBot: false }, select: { id: true } });
    if (found.length !== others.length) return { ok: false, error: "Hay un destinatario inválido" };
  }

  const creator = others.length ? await db.user.findUnique({ where: { id: session.id }, select: { name: true } }) : null;

  for (const uid of recipients) {
    const rem = await db.reminder.create({
      data: {
        title: built.title,
        notes: built.notes,
        icon: built.icon,
        color: built.color,
        priority: built.priority,
        forUserId: uid,
        createdById: session.id,
        taskId: built.taskId,
        eventId: built.eventId,
        frequency: built.frequency,
        weekdays: built.weekdays,
        dayOfMonth: built.dayOfMonth,
        timeOfDay: built.timeOfDay,
        untilYmd: built.untilYmd,
        maxFires: built.maxFires,
        nextFireAt: built.nextFireAt,
      },
    });
    await db.reminderAlert.createMany({
      data: built.specs.map((s) => ({ reminderId: rem.id, fireAt: s.fireAt, offsetMin: s.offsetMin })),
    });
    // Si es para otra persona, se le avisa de una vez (con el avatar de quien lo dejó).
    if (uid !== session.id) {
      await notify(uid, {
        type: "reminder",
        event: "reminder_assigned",
        title: `${creator?.name ?? "Alguien"} te dejó un recordatorio`,
        body: `${built.title} · ${shortWhen(built)}`,
        link: "/recordatorios",
        actorId: session.id,
      }).catch(() => {});
    }
  }

  await logActivity({ action: "reminder.create", summary: `creó el recordatorio «${built.title}»`, entityType: "reminder", silent: true });
  revalidatePath("/recordatorios");
  return { ok: true };
}

// Editar un recordatorio existente: reemplaza sus avisos y datos. El destinatario se conserva
// (para reasignar, se crea uno nuevo).
export async function updateReminder(id: string, input: NewReminderInput): Promise<Res> {
  const session = await teamSession();
  if (!session) return { ok: false, error: "Sin permiso" };
  const existing = await db.reminder.findUnique({ where: { id }, select: { forUserId: true, createdById: true } });
  if (!existing || !canManage(existing, session)) return { ok: false, error: "Sin permiso" };

  const built = await resolveReminder(input, new Date());
  if (!built.ok) return built;

  await db.reminder.update({
    where: { id },
    data: {
      title: built.title,
      notes: built.notes,
      icon: built.icon,
      color: built.color,
      priority: built.priority,
      taskId: built.taskId,
      eventId: built.eventId,
      frequency: built.frequency,
      weekdays: built.weekdays,
      dayOfMonth: built.dayOfMonth,
      timeOfDay: built.timeOfDay,
      untilYmd: built.untilYmd,
      maxFires: built.maxFires,
      nextFireAt: built.nextFireAt,
      active: true,
      doneAt: null,
    },
  });
  // Se rehacen los avisos (los ya disparados eran historial; al editar se reprograma limpio).
  await db.reminderAlert.deleteMany({ where: { reminderId: id } });
  await db.reminderAlert.createMany({
    data: built.specs.map((s) => ({ reminderId: id, fireAt: s.fireAt, offsetMin: s.offsetMin })),
  });

  await logActivity({ action: "reminder.update", summary: `editó el recordatorio «${built.title}»`, entityType: "reminder", entityId: id, silent: true });
  revalidatePath("/recordatorios");
  return { ok: true };
}

// Pausar / reactivar. Al reactivar se recalculan los avisos futuros; un puntual cuyos avisos
// ya pasaron no revive (mejor editarlo).
export async function toggleReminder(id: string, active: boolean): Promise<Res> {
  const session = await teamSession();
  if (!session) return { ok: false, error: "Sin permiso" };
  const r = await db.reminder.findUnique({ where: { id } });
  if (!r || !canManage(r, session)) return { ok: false, error: "Sin permiso" };

  if (!active) {
    await db.reminder.update({ where: { id }, data: { active: false } });
    await db.reminderAlert.updateMany({ where: { reminderId: id, sentAt: null }, data: { active: false } });
    revalidatePath("/recordatorios");
    return { ok: true };
  }

  // Reactivar
  const now = new Date();
  if (r.frequency !== "UNA_VEZ") {
    const next = nextFire(r, now);
    if (!next) return { ok: false, error: "La regla no genera ningún disparo" };
    if (r.untilYmd && bogotaYmd(next) > r.untilYmd) return { ok: false, error: "La recurrencia ya terminó; edítala" };
    await db.reminderAlert.updateMany({ where: { reminderId: id, sentAt: null }, data: { active: false } });
    await db.reminderAlert.create({ data: { reminderId: id, fireAt: next } });
    await db.reminder.update({ where: { id }, data: { active: true, doneAt: null, nextFireAt: next } });
  } else {
    // Reabre los avisos futuros que aún no sonaron.
    await db.reminderAlert.updateMany({
      where: { reminderId: id, sentAt: null, fireAt: { gt: now } },
      data: { active: true },
    });
    const pending = await db.reminderAlert.count({ where: { reminderId: id, active: true, sentAt: null } });
    if (!pending) return { ok: false, error: "Sus avisos ya pasaron; edítalo" };
    await db.reminder.update({ where: { id }, data: { active: true, doneAt: null } });
    await recomputeReminderNext(id);
  }
  revalidatePath("/recordatorios");
  return { ok: true };
}

// Marcar hecho (historial). Distinto de eliminar: queda registrado.
export async function completeReminder(id: string): Promise<Res> {
  const session = await teamSession();
  if (!session) return { ok: false, error: "Sin permiso" };
  const r = await db.reminder.findUnique({ where: { id }, select: { forUserId: true, createdById: true, title: true } });
  if (!r || !canManage(r, session)) return { ok: false, error: "Sin permiso" };
  await markReminderDone(id);
  await logActivity({ action: "reminder.complete", summary: `marcó hecho el recordatorio «${r.title}»`, entityType: "reminder", entityId: id, silent: true });
  revalidatePath("/recordatorios");
  return { ok: true };
}

// Instante destino de un "posponer" según la opción elegida (hora de Bogotá).
function snoozeTarget(kind: string, now: Date): Date | null {
  const bog = bogotaYmd(now);
  switch (kind) {
    case "10m":
      return new Date(now.getTime() + 10 * 60_000);
    case "1h":
      return new Date(now.getTime() + 3_600_000);
    case "3h":
      return new Date(now.getTime() + 3 * 3_600_000);
    case "tarde": {
      const t = utcFromBogota(bog, "18:00");
      return t.getTime() > now.getTime() + 5 * 60_000 ? t : utcFromBogota(ymdPlus(bog, 1), "18:00");
    }
    case "manana":
      return utcFromBogota(ymdPlus(bog, 1), "08:00");
    case "semana":
      return utcFromBogota(ymdPlus(bog, 7), "08:00");
    default:
      return null;
  }
}

export async function snoozeReminder(id: string, kind: string): Promise<Res> {
  const session = await teamSession();
  if (!session) return { ok: false, error: "Sin permiso" };
  const r = await db.reminder.findUnique({ where: { id }, select: { forUserId: true, createdById: true } });
  if (!r || !canManage(r, session)) return { ok: false, error: "Sin permiso" };
  const target = snoozeTarget(kind, new Date());
  if (!target) return { ok: false, error: "Opción de posponer inválida" };
  await snoozeReminderTo(id, target);
  revalidatePath("/recordatorios");
  return { ok: true };
}

export async function deleteReminder(id: string): Promise<Res> {
  const session = await teamSession();
  if (!session) return { ok: false, error: "Sin permiso" };
  const r = await db.reminder.findUnique({ where: { id }, select: { forUserId: true, createdById: true, title: true } });
  if (!r || !canManage(r, session)) return { ok: false, error: "Sin permiso" };
  await db.reminder.delete({ where: { id } });
  await logActivity({ action: "reminder.delete", summary: `borró el recordatorio «${r.title}»`, entityType: "reminder", entityId: id, silent: true });
  revalidatePath("/recordatorios");
  return { ok: true };
}

// Acción disparada desde el botón del PUSH (service worker). Reusa la sesión por cookie.
export async function reminderPushAction(id: string, action: "snooze" | "done"): Promise<Res> {
  const session = await teamSession();
  if (!session) return { ok: false, error: "Sin permiso" };
  const r = await db.reminder.findUnique({ where: { id }, select: { forUserId: true, createdById: true } });
  if (!r || !canManage(r, session)) return { ok: false, error: "Sin permiso" };
  if (action === "done") await markReminderDone(id);
  else await snoozeReminderTo(id, new Date(Date.now() + 10 * 60_000));
  revalidatePath("/recordatorios");
  return { ok: true };
}

// Recordatorios de una tarea (para el panel de detalle en Mis tareas).
export type TaskReminderItem = {
  id: string;
  title: string;
  schedule: string;
  nextFireAtIso: string;
  forUserName: string;
  active: boolean;
  canManage: boolean;
};

export async function getTaskReminders(taskId: string): Promise<TaskReminderItem[]> {
  const session = await teamSession();
  if (!session) return [];
  // No filtrar los recordatorios (título + destinatario) de una tarea a la que el usuario no tiene
  // acceso: antes bastaba con adivinar el id de la tarea. Tarea de proyecto → exige acceso al
  // proyecto; tarea personal (sin proyecto) → solo su dueño o su responsable.
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { ownerId: true, assigneeId: true, project: { select: { isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } } },
  });
  if (!task) return [];
  if (task.project) {
    if (!canAccessProject(task.project, session)) return [];
  } else if (task.ownerId !== session.id && task.assigneeId !== session.id) {
    return [];
  }
  const rows = await db.reminder.findMany({
    where: { taskId, active: true, doneAt: null },
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
