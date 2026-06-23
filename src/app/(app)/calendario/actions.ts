"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessProject } from "@/lib/project-access";
import { notifyAndEmail } from "@/lib/notify";
import { pushEventToParticipants, removeEventFromParticipants, removeEventForUsers, sendGuestInvites, sendEventCancellations } from "@/lib/calendar-sync";
import { createCalendarEventCore } from "@/lib/calendar-create";

const APP_TZ_HINT = ""; // las fechas se interpretan en hora del servidor app
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Parsea el campo de invitados externos (correos separados por coma/espacio/línea).
function parseGuestEmails(formData: FormData): string[] {
  const raw = formData.getAll("guests").flatMap((v) => String(v).split(/[\s,;]+/)).map((s) => s.trim().toLowerCase());
  return [...new Set(raw.filter((e) => EMAIL_RE.test(e)))];
}

// Crea una cita/reunión del equipo. Vive en la BD; si hay asistentes con Synology
// conectado, se escribe en su calendario y se les notifica (app + correo).
export async function createMyEvent(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  if (!hasPermission(session, "gestionar_calendario")) throw new Error("No autorizado");
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
  });
}

// Edita una cita creada por mí: actualiza datos y asistentes, re-sincroniza con
// Synology (re-escribe a los que siguen, quita a los retirados) y notifica a los nuevos.
export async function updateMyEvent(eventId: string, formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  if (!hasPermission(session, "gestionar_calendario")) throw new Error("No autorizado");
  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
    select: { createdById: true, source: true, title: true, start: true, end: true, location: true, allDay: true, attendees: { select: { userId: true } }, guests: { select: { email: true } } },
  });
  if (!event) return;
  if (event.createdById !== session.id || event.source !== "app") throw new Error("No autorizado");

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

  await db.calendarEvent.update({
    where: { id: eventId },
    data: {
      title, description: description || null, location: location || null, start, end, allDay,
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

  // Quitar de Synology a los retirados; re-escribir a los que quedan.
  if (removed.length) await removeEventForUsers(eventId, removed);
  await pushEventToParticipants(eventId);
  // Enviar invitación .ics solo a los invitados externos nuevos.
  if (addedGuests.length) await sendGuestInvites(eventId, addedGuests);

  // Notificar a los nuevos asistentes (no a uno mismo).
  const when = allDay
    ? new Date(start).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
    : new Date(start).toLocaleString("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  for (const userId of added) {
    if (userId === session.id) continue;
    await notifyAndEmail(userId, {
      type: "event",
      title: `Te agregaron a una cita: ${title}`,
      body: `${session.name} te invitó · ${when}`,
      link: "/calendario",
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
        title: `Se actualizó la cita: ${title}`,
        body: `${session.name} hizo cambios · ${when}${location ? ` · ${location}` : ""}`,
        link: "/calendario",
      });
    }
  }
  // Avisar a los retirados que ya no están en la cita.
  for (const userId of removed) {
    if (userId === session.id) continue;
    await notifyAndEmail(userId, {
      type: "event",
      title: `Te quitaron de la cita: ${event.title}`,
      body: `${session.name} actualizó los asistentes.`,
      link: "/calendario",
    });
  }
  revalidatePath("/calendario");
}

// Reubica/redimensiona una cita creada por mí (arrastrar en la vista semanal).
// Solo cambia inicio/fin y re-sincroniza con Synology; no toca asistentes ni notifica.
export async function moveMyEvent(eventId: string, startIso: string, endIso: string | null): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  if (!hasPermission(session, "gestionar_calendario")) throw new Error("No autorizado");
  const event = await db.calendarEvent.findUnique({ where: { id: eventId }, select: { createdById: true, source: true, allDay: true, title: true, attendees: { select: { userId: true } } } });
  if (!event) return;
  if (event.createdById !== session.id || event.source !== "app") throw new Error("No autorizado");
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return;
  const end = endIso ? new Date(endIso) : null;
  if (end && (Number.isNaN(end.getTime()) || end <= start)) return;
  await db.calendarEvent.update({ where: { id: eventId }, data: { start, end } });
  await pushEventToParticipants(eventId);
  // Avisar a los asistentes (menos a mí) que la cita se movió.
  const when = event.allDay
    ? new Date(start).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
    : new Date(start).toLocaleString("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  for (const a of event.attendees) {
    if (a.userId === session.id) continue;
    await notifyAndEmail(a.userId, { type: "event", title: `Se movió la cita: ${event.title}`, body: `${session.name} la reprogramó · ${when}`, link: "/calendario" });
  }
  revalidatePath("/calendario");
}

// Borra una cita creada por mí (y la quita de los Synology donde se escribió).
export async function deleteMyEvent(eventId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  if (!hasPermission(session, "gestionar_calendario")) throw new Error("No autorizado");
  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
    select: { createdById: true, title: true, start: true, allDay: true, attendees: { select: { userId: true } } },
  });
  if (!event) return;
  if (event.createdById !== session.id) throw new Error("No autorizado");
  // Avisar (app + correo) a los asistentes que se canceló, y mandar el .ics de
  // cancelación a los invitados externos — ANTES de borrar (necesitan los datos).
  const when = event.allDay
    ? new Date(event.start).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
    : new Date(event.start).toLocaleString("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  for (const a of event.attendees) {
    if (a.userId === session.id) continue;
    await notifyAndEmail(a.userId, { type: "event", title: `Se canceló la cita: ${event.title}`, body: `${session.name} canceló la cita que estaba para ${when}.`, link: "/calendario" });
  }
  await sendEventCancellations(eventId).catch(() => 0);
  // Quitarlo de Synology (necesita los EventSyncRef, que se borran en cascada).
  await removeEventFromParticipants(eventId);
  await db.calendarEvent.delete({ where: { id: eventId } });
  revalidatePath("/calendario");
}
