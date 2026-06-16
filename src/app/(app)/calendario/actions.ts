"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notifyAndEmail } from "@/lib/notify";
import { appUid, pushEventToParticipants, removeEventFromParticipants } from "@/lib/calendar-sync";

const APP_TZ_HINT = ""; // las fechas se interpretan en hora del servidor app

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
  // Asistentes mencionados (ids de usuario), separados por coma o repetidos.
  const attendeeIds = formData.getAll("attendees").flatMap((v) => String(v).split(",")).map((s) => s.trim()).filter(Boolean);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

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
      start,
      end,
      allDay,
      source: "app",
      createdById: session.id,
      attendees: { create: [...validIds].map((userId) => ({ userId })) },
    },
  });
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

  // Escribir en los calendarios Synology conectados (best-effort).
  await pushEventToParticipants(event.id);
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
