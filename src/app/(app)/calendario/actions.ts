"use server";

import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessProject, hasFullAccess, canWriteProject } from "@/lib/project-access";
import { notifyAndEmail } from "@/lib/notify";
import { pushEventToParticipants, removeEventFromParticipants, removeEventForUsers, sendGuestInvites, sendEventCancellations } from "@/lib/calendar-sync";
import { createCalendarEventCore } from "@/lib/calendar-create";
import { syncEventAnchoredAlerts, disableEventAnchoredAlerts, syncTaskAnchoredAlerts } from "@/lib/reminder-alerts";

const APP_TZ_HINT = ""; // las fechas se interpretan en hora del servidor app
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Parsea el campo de invitados externos (correos separados por coma/espacio/línea).
function parseGuestEmails(formData: FormData): string[] {
  const raw = formData.getAll("guests").flatMap((v) => String(v).split(/[\s,;]+/)).map((s) => s.trim().toLowerCase());
  return [...new Set(raw.filter((e) => EMAIL_RE.test(e)))];
}

// Parsea el recordatorio del formulario: "" (sin campo) = undefined (default), "0" = sin
// recordatorio (null), "N" = N minutos antes (acotado a 1–1440).
function parseReminder(formData: FormData): number | null | undefined {
  if (!formData.has("reminderMinutes")) return undefined;
  const n = Number(String(formData.get("reminderMinutes") ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(1440, Math.round(n));
}

// Crea una cita/reunión del equipo. Vive en la BD; si hay asistentes con Synology
// conectado, se escribe en su calendario y se les notifica (app + correo).
export async function createMyEvent(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) noAutorizado();
  if (!hasPermission(session, "gestionar_calendario")) noAutorizado();
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim(); // YYYY-MM-DD
  const time = String(formData.get("time") ?? "").trim(); // HH:mm o ""
  const endTime = String(formData.get("endTime") ?? "").trim(); // HH:mm o ""
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim(); // sala o enlace de Meet
  // Asistentes mencionados (ids de usuario), separados por coma o repetidos.
  const attendeeIds = formData.getAll("attendees").flatMap((v) => String(v).split(",")).map((s) => s.trim()).filter(Boolean);
  const guestEmails = parseGuestEmails(formData);
  // Proyecto al que pertenece la cita (cuando se crea desde el calendario de un proyecto).
  const rawProjectId = String(formData.get("projectId") ?? "").trim() || null;
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  // Solo se acepta el proyecto si existe Y el usuario tiene acceso a él; si no, se
  // ignora y la cita queda como evento personal (no se confía en el projectId del cliente).
  const projectId = rawProjectId && (await userCanAccessProject(rawProjectId, session)) ? rawProjectId : null;

  // Creación + asistentes + notificación al invitado + sync Synology: núcleo compartido con
  // la herramienta de Marcebot (create_calendar_event), para que ambas citas sean idénticas.
  await createCalendarEventCore({
    creatorId: session.id,
    creatorName: session.name,
    title,
    date,
    time,
    endTime,
    description,
    location,
    attendeeIds,
    guestEmails,
    projectId,
    reminderMinutes: parseReminder(formData),
  });
}

// Edita una cita creada por mí: actualiza datos y asistentes, re-sincroniza con
// Synology (re-escribe a los que siguen, quita a los retirados) y notifica a los nuevos.
export async function updateMyEvent(eventId: string, formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) noAutorizado();
  if (!hasPermission(session, "gestionar_calendario")) noAutorizado();
  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
    select: { createdById: true, source: true, title: true, start: true, end: true, location: true, allDay: true, attendees: { select: { userId: true } }, guests: { select: { email: true } } },
  });
  if (!event) return;
  if (event.createdById !== session.id || event.source !== "app") noAutorizado();

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const endTime = String(formData.get("endTime") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const attendeeIds = formData.getAll("attendees").flatMap((v) => String(v).split(",")).map((s) => s.trim()).filter(Boolean);
  const guestEmails = parseGuestEmails(formData);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  const allDay = !time;
  const start = new Date(`${date}T${allDay ? "09:00" : time}:00${APP_TZ_HINT}`);
  if (Number.isNaN(start.getTime())) return;
  const end = !allDay && endTime ? new Date(`${date}T${endTime}:00${APP_TZ_HINT}`) : null;

  // Asistentes deseados (siempre incluye al creador).
  const desired = new Set<string>([session.id]);
  if (attendeeIds.length) {
    const users = await db.user.findMany({ where: { id: { in: attendeeIds }, active: true }, select: { id: true } });
    users.forEach((u) => desired.add(u.id));
  }
  const before = new Set(event.attendees.map((a) => a.userId));
  const removed = [...before].filter((id) => !desired.has(id));
  const added = [...desired].filter((id) => !before.has(id));

  // Invitados externos: reconciliar (añadir nuevos, quitar los que ya no están).
  const beforeGuests = new Set(event.guests.map((g) => g.email));
  const addedGuests = guestEmails.filter((e) => !beforeGuests.has(e));
  const removedGuests = [...beforeGuests].filter((e) => !guestEmails.includes(e));

  const reminder = parseReminder(formData);
  // Si la cita cambió de fecha/hora, se limpia la marca del recordatorio para que el
  // scheduler vuelva a avisar en el nuevo horario.
  const timeChanged = event.start.getTime() !== start.getTime() || (event.end?.getTime() ?? null) !== (end?.getTime() ?? null);
  await db.calendarEvent.update({
    where: { id: eventId },
    data: {
      title, description: description || null, location: location || null, start, end, allDay,
      ...(reminder !== undefined ? { reminderMinutes: reminder } : {}),
      ...(timeChanged ? { reminderSentAt: null } : {}),
      attendees: {
        deleteMany: removed.length ? { userId: { in: removed } } : undefined,
        create: added.map((userId) => ({ userId })),
      },
      guests: {
        deleteMany: removedGuests.length ? { email: { in: removedGuests } } : undefined,
        create: addedGuests.map((email) => ({ email })),
      },
    },
  });
  // Si cambió el horario, recalcula los recordatorios personales atados ("avísame antes").
  if (timeChanged) await syncEventAnchoredAlerts(eventId).catch(() => {});

  // Quitar de Synology a los retirados; re-escribir a los que quedan.
  if (removed.length) await removeEventForUsers(eventId, removed);
  await pushEventToParticipants(eventId);
  // Enviar invitación .ics solo a los invitados externos nuevos.
  if (addedGuests.length) await sendGuestInvites(eventId, addedGuests);

  // Notificar a los nuevos asistentes (no a uno mismo).
  const when = allDay
    ? new Date(start).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
    : new Date(start).toLocaleString("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  for (const userId of added) {
    if (userId === session.id) continue;
    await notifyAndEmail(userId, {
      type: "event",
      event: "calendar_event",
      title: `Te agregaron a una cita: ${title}`,
      body: `${session.name} te invitó · ${when}`,
      link: "/calendario",
      actorId: session.id,
    });
  }

  // Avisar a quienes SIGUEN en la cita si cambió algo relevante (fecha/hora/lugar/título).
  const changed =
    event.title !== title ||
    event.start.getTime() !== start.getTime() ||
    (event.end?.getTime() ?? null) !== (end?.getTime() ?? null) ||
    (event.location ?? "") !== (location || "") ||
    event.allDay !== allDay;
  if (changed) {
    const staying = [...desired].filter((id) => before.has(id) && id !== session.id);
    for (const userId of staying) {
      await notifyAndEmail(userId, {
        type: "event",
        event: "calendar_event",
        title: `Se actualizó la cita: ${title}`,
        body: `${session.name} hizo cambios · ${when}${location ? ` · ${location}` : ""}`,
        link: "/calendario",
        actorId: session.id,
      });
    }
  }
  // Avisar a los retirados que ya no están en la cita.
  for (const userId of removed) {
    if (userId === session.id) continue;
    await notifyAndEmail(userId, {
      type: "event",
      event: "calendar_event",
      title: `Te quitaron de la cita: ${event.title}`,
      body: `${session.name} actualizó los asistentes.`,
      link: "/calendario",
      actorId: session.id,
    });
  }
  revalidatePath("/calendario");
}

// Reubica/redimensiona una cita creada por mí (arrastrar en la vista semanal).
// Solo cambia inicio/fin y re-sincroniza con Synology; no toca asistentes ni notifica.
export async function moveMyEvent(eventId: string, startIso: string, endIso: string | null): Promise<void> {
  const session = await getSession();
  if (!session) noAutorizado();
  if (!hasPermission(session, "gestionar_calendario")) noAutorizado();
  const event = await db.calendarEvent.findUnique({ where: { id: eventId }, select: { createdById: true, source: true, allDay: true, title: true, attendees: { select: { userId: true } } } });
  if (!event) return;
  // Puede MOVER la cita el creador o un admin/productor (para reorganizar la agenda del equipo).
  // La edición/borrado siguen siendo solo del creador. Las citas importadas (Synology) no se mueven.
  if (event.source !== "app" || (event.createdById !== session.id && !hasFullAccess(session))) noAutorizado();
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return;
  const end = endIso ? new Date(endIso) : null;
  if (end && (Number.isNaN(end.getTime()) || end <= start)) return;
  // Cambió el horario → el recordatorio vuelve a estar pendiente.
  await db.calendarEvent.update({ where: { id: eventId }, data: { start, end, reminderSentAt: null } });
  // Recalcula los recordatorios personales atados a esta cita ("avísame 15 min antes").
  await syncEventAnchoredAlerts(eventId).catch(() => {});
  await pushEventToParticipants(eventId);
  // Avisar a los asistentes (menos a mí) que la cita se movió.
  const when = event.allDay
    ? new Date(start).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
    : new Date(start).toLocaleString("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  for (const a of event.attendees) {
    if (a.userId === session.id) continue;
    await notifyAndEmail(a.userId, { type: "event", event: "calendar_event", title: `Se movió la cita: ${event.title}`, body: `${session.name} la reprogramó · ${when}`, link: "/calendario", actorId: session.id });
  }
  revalidatePath("/calendario");
}

// Reprograma una TAREA arrastrando su bloque en la vista Semana/Día del calendario: cambia su
// fecha de entrega (dueDate) y su hora (dueTime), y avisa a los "citados" de la tarea (asignado y
// dueño) que se movió. Permiso: dueño/asignado de la tarea, admin/productor, o quien puede escribir
// en su proyecto. Convención de fechas: los campos UTC del ISO recibido SON la hora de pared.
export async function moveMyTask(taskId: string, startIso: string): Promise<void> {
  const session = await getSession();
  if (!session) noAutorizado();
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(startIso);
  if (!m) return;
  const [, date, time] = m;
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      title: true, projectId: true, ownerId: true, assigneeId: true,
      project: { select: { name: true, isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } },
    },
  });
  if (!task) return;
  const mayMove =
    task.ownerId === session!.id ||
    task.assigneeId === session!.id ||
    hasFullAccess(session) ||
    (!!task.project && canWriteProject(task.project, session));
  if (!mayMove) noAutorizado();
  // dueDate = día anclado a mediodía UTC; dueTime = "HH:mm" (la tarea sigue mostrándose a esa hora).
  await db.task.update({ where: { id: taskId }, data: { dueDate: new Date(`${date}T12:00:00.000Z`), dueTime: time } });
  // Recalcula los recordatorios personales atados a la tarea ("avísame antes de esta tarea").
  await syncTaskAnchoredAlerts(taskId).catch(() => {});
  // Avisar a los citados (asignado + dueño), menos a quien la movió.
  const when = new Date(`${date}T${time}:00.000Z`).toLocaleString("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const recipients = [...new Set([task.assigneeId, task.ownerId].filter((x): x is string => !!x && x !== session!.id))];
  for (const uid of recipients) {
    await notifyAndEmail(uid, {
      type: "task", event: "task_moved",
      title: `Se reprogramó: ${task.title}`,
      body: `${session!.name} la movió · ${when}${task.project ? ` en «${task.project.name}»` : ""}`,
      link: "/calendario", actorId: session!.id,
    }).catch(() => null);
  }
  if (task.projectId) revalidatePath(`/proyectos/${task.projectId}`);
  revalidatePath("/calendario");
}

// Borra una cita creada por mí (y la quita de los Synology donde se escribió).
export async function deleteMyEvent(eventId: string): Promise<void> {
  const session = await getSession();
  if (!session) noAutorizado();
  if (!hasPermission(session, "gestionar_calendario")) noAutorizado();
  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
    select: { createdById: true, title: true, start: true, allDay: true, attendees: { select: { userId: true } } },
  });
  if (!event) return;
  if (event.createdById !== session.id) noAutorizado();
  // Avisar (app + correo) a los asistentes que se canceló, y mandar el .ics de
  // cancelación a los invitados externos — ANTES de borrar (necesitan los datos).
  const when = event.allDay
    ? new Date(event.start).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
    : new Date(event.start).toLocaleString("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  for (const a of event.attendees) {
    if (a.userId === session.id) continue;
    await notifyAndEmail(a.userId, { type: "event", event: "calendar_event", title: `Se canceló la cita: ${event.title}`, body: `${session.name} canceló la cita que estaba para ${when}.`, link: "/calendario", actorId: session.id });
  }
  await sendEventCancellations(eventId).catch(() => 0);
  // Apaga los avisos "X antes" de los recordatorios atados (el FK se pone en null al borrar).
  await disableEventAnchoredAlerts(eventId).catch(() => {});
  // Quitarlo de Synology (necesita los EventSyncRef, que se borran en cascada).
  await removeEventFromParticipants(eventId);
  await db.calendarEvent.delete({ where: { id: eventId } });
  revalidatePath("/calendario");
}

// ── RSVP: responder una invitación (¿Asistirás? Sí / No / Tal vez) ──
// Cualquier ASISTENTE de la cita puede responder por sí mismo. Guarda el estado en
// CalendarAttendee.status, avisa al organizador y re-escribe el .ics en los Synology
// conectados para que el PARTSTAT refleje la respuesta también allá.
const RSVP_STATUSES = new Set(["ACCEPTED", "DECLINED", "TENTATIVE"]);
const RSVP_LABEL: Record<string, string> = { ACCEPTED: "asistirá", DECLINED: "no asistirá", TENTATIVE: "tal vez asista" };

export async function respondToEvent(eventId: string, status: string): Promise<void> {
  const session = await getSession();
  if (!session) noAutorizado();
  if (!RSVP_STATUSES.has(status)) return;
  const attendee = await db.calendarAttendee.findUnique({
    where: { eventId_userId: { eventId, userId: session!.id } },
    select: { status: true, event: { select: { title: true, start: true, allDay: true, createdById: true, source: true } } },
  });
  // Solo los invitados de la cita responden (y solo por sí mismos).
  if (!attendee) noAutorizado();
  if (attendee!.status === status) return;
  await db.calendarAttendee.update({
    where: { eventId_userId: { eventId, userId: session!.id } },
    data: { status },
  });
  // Avisar al organizador (si no soy yo mismo).
  const ev = attendee!.event;
  if (ev.createdById && ev.createdById !== session!.id) {
    const when = ev.allDay
      ? new Date(ev.start).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
      : new Date(ev.start).toLocaleString("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    await notifyAndEmail(ev.createdById, {
      type: "event",
      event: "calendar_event",
      title: `${session!.name} ${RSVP_LABEL[status]}: ${ev.title}`,
      body: `Respondió a tu invitación · ${when}`,
      link: "/calendario",
      actorId: session!.id,
    }).catch(() => null);
  }
  // Re-subir el .ics con el PARTSTAT actualizado (solo aplica a citas de la app).
  if (ev.source === "app") await pushEventToParticipants(eventId).catch(() => null);
  revalidatePath("/calendario");
}
