import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { notifyAndEmail } from "@/lib/notify";
import { appUid, pushEventToParticipants, sendGuestInvites } from "@/lib/calendar-sync";

// ── Creación de citas del calendario (núcleo COMPARTIDO) ──
// Lo usan la acción del calendario (createMyEvent, desde la UI) y la herramienta de Marcebot
// (create_calendar_event, desde el chat). Centralizar aquí garantiza que una cita creada por
// el bot sea IDÉNTICA a una creada a mano: mismos asistentes, misma notificación al invitado
// (app + correo), mismo UID estable y misma sincronización con los calendarios Synology.
//
// NO comprueba permisos: el llamador debe haber validado `gestionar_calendario` y el acceso al
// proyecto. Por eso vive en un lib normal (server-only), NO en un archivo "use server" (no debe
// quedar expuesto como server action invocable sin permisos).
//
// Convención de fechas de la app: "hora de pared en UTC" (el contenedor corre en UTC). La hora
// que llega (p. ej. "15:00") se guarda tal cual y se muestra tal cual; no se convierte de zona.

const APP_TZ_HINT = ""; // las fechas se interpretan en hora del servidor (UTC en el contenedor)

export type CreateEventInput = {
  creatorId: string;
  creatorName: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm (vacío = todo el día)
  endTime?: string; // HH:mm (opcional)
  description?: string;
  location?: string;
  attendeeIds?: string[]; // ids de usuario a invitar (el creador se incluye siempre)
  guestEmails?: string[]; // invitados externos por correo
  projectId?: string | null; // el llamador ya validó el acceso
  // Recordatorio en minutos antes del inicio (aviso in-app + VALARM en Synology).
  // undefined = 15 por defecto; null o 0 = sin recordatorio.
  reminderMinutes?: number | null;
};

export type CreateEventResult = { id: string; start: Date; allDay: boolean; invitedCount: number };

export async function createCalendarEventCore(input: CreateEventInput): Promise<CreateEventResult | null> {
  const title = input.title.trim();
  const date = input.date.trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const time = (input.time ?? "").trim();
  const endTime = (input.endTime ?? "").trim();
  const allDay = !time;
  const start = new Date(`${date}T${allDay ? "09:00" : time}:00${APP_TZ_HINT}`);
  if (Number.isNaN(start.getTime())) return null;
  const end = !allDay && endTime ? new Date(`${date}T${endTime}:00${APP_TZ_HINT}`) : null;
  const projectId = input.projectId ?? null;

  // Asistentes válidos (activos); el creador SIEMPRE va incluido.
  const validIds = new Set<string>([input.creatorId]);
  if (input.attendeeIds?.length) {
    const users = await db.user.findMany({ where: { id: { in: input.attendeeIds }, active: true }, select: { id: true } });
    users.forEach((u) => validIds.add(u.id));
  }
  const guestEmails = input.guestEmails ?? [];

  const event = await db.calendarEvent.create({
    data: {
      title,
      description: (input.description ?? "").trim() || null,
      location: (input.location ?? "").trim() || null,
      start,
      end,
      allDay,
      source: "app",
      projectId,
      createdById: input.creatorId,
      // Recordatorio: 15 min por defecto; null/0 = sin recordatorio.
      reminderMinutes: input.reminderMinutes === undefined ? 15 : input.reminderMinutes || null,
      attendees: { create: [...validIds].map((userId) => ({ userId })) },
      guests: { create: guestEmails.map((email) => ({ email })) },
    },
  });
  // UID estable para casar con Synology en ambos sentidos.
  await db.calendarEvent.update({ where: { id: event.id }, data: { uid: appUid(event.id) } });

  // Notificar a cada invitado (no al creador) que lo agregaron a la cita.
  const when = allDay
    ? new Date(start).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
    : new Date(start).toLocaleString("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  for (const userId of validIds) {
    if (userId === input.creatorId) continue;
    await notifyAndEmail(userId, {
      type: "event",
      title: `Te agregaron a una cita: ${title}`,
      body: `${input.creatorName} te invitó · ${when}`,
      link: "/calendario",
    }).catch(() => null);
  }

  // Escribir en los calendarios Synology conectados + enviar .ics a los externos.
  await pushEventToParticipants(event.id).catch(() => null);
  await sendGuestInvites(event.id).catch(() => null);

  // Revalidación best-effort (puede correr en segundo plano, p. ej. desde Marcebot).
  try {
    if (projectId) revalidatePath(`/proyectos/${projectId}`);
    revalidatePath("/calendario");
  } catch {
    /* fuera de contexto de request: no pasa nada */
  }

  return { id: event.id, start, allDay, invitedCount: validIds.size - 1 };
}
