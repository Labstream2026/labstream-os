"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notifyAndEmail } from "@/lib/notify";
import { appUid, pushEventToParticipants, removeEventFromParticipants, removeEventForUsers, sendGuestInvites } from "@/lib/calendar-sync";

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

  // Solo se acepta el proyecto si existe (la privacidad se aplica al mostrarlo).
  const projectId = rawProjectId && (await db.project.findUnique({ where: { id: rawProjectId }, select: { id: true } })) ? rawProjectId : null;

  const allDay = !time;
  const start = new Date(`${date}T${allDay ? "09:00" : time}:00${APP_TZ_HINT}`);
  if (Number.isNaN(start.getTime())) return;
  const end = !allDay && endTime ? new Date(`${date}T${endTime}:00${APP_TZ_HINT}`) : null;

  // Validar que los asistentes existan y estén activos; siempre incluir al creador.
  const validIds = new Set<string>([session.id]);
  if (attendeeIds.length) {
    const users = await db.user.findMany({ where: { id: { in: attendeeIds }, active: true }, select: { id: true } });
    users.forEach((u) => validIds.add(u.id));
  }

  const event = await db.calendarEvent.create({
    data: {
      title,
      description: description || null,
      location: location || null,
      start,
      end,
      allDay,
      source: "app",
      projectId,
      createdById: session.id,
      attendees: { create: [...validIds].map((userId) => ({ userId })) },
      guests: { create: guestEmails.map((email) => ({ email })) },
    },
  });
  // Si pertenece a un proyecto, lo revalidamos para que aparezca su calendario.
  if (projectId) revalidatePath(`/proyectos/${projectId}`);
  // UID estable para casar con Synology en ambos sentidos.
  await db.calendarEvent.update({ where: { id: event.id }, data: { uid: appUid(event.id) } });

  // Notificar a los asistentes mencionados (no a uno mismo).
  const when = allDay
    ? new Date(start).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
    : new Date(start).toLocaleString("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  for (const userId of validIds) {
    if (userId === session.id) continue;
    await notifyAndEmail(userId, {
      type: "event",
      title: `Te agregaron a una cita: ${title}`,
      body: `${session.name} te invitó · ${when}`,
      link: "/calendario",
    });
  }

  // Escribir en los calendarios Synology conectados + enviar .ics a los externos.
  await pushEventToParticipants(event.id);
  await sendGuestInvites(event.id);
  revalidatePath("/calendario");
}

// Edita una cita creada por mí: actualiza datos y asistentes, re-sincroniza con
// Synology (re-escribe a los que siguen, quita a los retirados) y notifica a los nuevos.
export async function updateMyEvent(eventId: string, formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
    select: { createdById: true, source: true, attendees: { select: { userId: true } }, guests: { select: { email: true } } },
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
  revalidatePath("/calendario");
}

// Reubica/redimensiona una cita creada por mí (arrastrar en la vista semanal).
// Solo cambia inicio/fin y re-sincroniza con Synology; no toca asistentes ni notifica.
export async function moveMyEvent(eventId: string, startIso: string, endIso: string | null): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const event = await db.calendarEvent.findUnique({ where: { id: eventId }, select: { createdById: true, source: true, allDay: true } });
  if (!event) return;
  if (event.createdById !== session.id || event.source !== "app") throw new Error("No autorizado");
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return;
  const end = endIso ? new Date(endIso) : null;
  if (end && (Number.isNaN(end.getTime()) || end <= start)) return;
  await db.calendarEvent.update({ where: { id: eventId }, data: { start, end } });
  await pushEventToParticipants(eventId);
  revalidatePath("/calendario");
}

// Borra una cita creada por mí (y la quita de los Synology donde se escribió).
export async function deleteMyEvent(eventId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const event = await db.calendarEvent.findUnique({ where: { id: eventId }, select: { createdById: true } });
  if (!event) return;
  if (event.createdById !== session.id) throw new Error("No autorizado");
  // Primero quitarlo de Synology (necesita los EventSyncRef, que se borran en cascada).
  await removeEventFromParticipants(eventId);
  await db.calendarEvent.delete({ where: { id: eventId } });
  revalidatePath("/calendario");
}
