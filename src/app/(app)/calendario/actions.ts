"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { pushEventToSynology } from "@/lib/caldav";

// Crea una cita/reunión del equipo desde el calendario. Vive en la BD (no depende
// de CalDAV); si Synology está configurado, además se sincroniza (best-effort).
export async function createMyEvent(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim(); // YYYY-MM-DD
  const time = String(formData.get("time") ?? "").trim(); // HH:mm o ""
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  const allDay = !time;
  const start = new Date(`${date}T${allDay ? "09:00" : time}:00`);
  if (Number.isNaN(start.getTime())) return;

  const event = await db.calendarEvent.create({
    data: {
      title,
      start,
      allDay,
      createdById: session.id,
      attendees: { create: [{ userId: session.id }] },
    },
  });
  await pushEventToSynology({ uid: event.id, title: event.title, start: event.start });
  revalidatePath("/calendario");
}
