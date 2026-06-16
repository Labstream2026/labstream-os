import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { buildIcs, type IcsAttendee } from "@/lib/ics";
import { parseIcs } from "@/lib/ics-parse";
import { putEvent, deleteEvent, queryEvents, type CalDavAuth } from "@/lib/caldav-client";
import type { CalendarConnection } from "@prisma/client";

// UID iCalendar estable para un evento de la app.
export function appUid(eventId: string): string {
  return `${eventId}@labstreamsas.com`;
}

function authOf(conn: CalendarConnection): CalDavAuth {
  return { serverUrl: conn.serverUrl, username: conn.username, password: decryptSecret(conn.passwordEnc) };
}

// Conexiones activas y configuradas de un conjunto de usuarios.
async function activeConnections(userIds: string[]): Promise<Map<string, CalendarConnection>> {
  const conns = await db.calendarConnection.findMany({
    where: { userId: { in: userIds }, enabled: true, NOT: { calendarUrl: null } },
  });
  return new Map(conns.map((c) => [c.userId, c]));
}

// Escribe (crea/actualiza) un evento de la app en el Synology Calendar de cada
// participante conectado (creador + asistentes). Best-effort: nunca rompe el flujo.
export async function pushEventToParticipants(eventId: string): Promise<void> {
  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
    include: {
      attendees: { include: { user: { select: { id: true, name: true, email: true } } } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!event) return;
  // Eventos importados de Synology no se reescriben (evita bucles).
  if (event.source !== "app") return;

  const participants = new Map<string, { name: string; email: string }>();
  if (event.createdBy?.email) participants.set(event.createdBy.id, { name: event.createdBy.name, email: event.createdBy.email });
  for (const a of event.attendees) {
    if (a.user.email) participants.set(a.user.id, { name: a.user.name, email: a.user.email });
  }
  const icsAttendees: IcsAttendee[] = [...participants.values()].map((p) => ({ email: p.email, name: p.name }));
  const conns = await activeConnections([...participants.keys()]);
  if (conns.size === 0) return;

  const uid = event.uid ?? appUid(event.id);
  const existingRefs = new Map(
    (await db.eventSyncRef.findMany({ where: { eventId } })).map((r) => [r.userId, r]),
  );

  for (const [userId, conn] of conns) {
    try {
      const auth = authOf(conn);
      const organizer = participants.get(event.createdById ?? "") ?? participants.get(userId)!;
      const ics = buildIcs({
        uid,
        title: event.title,
        start: event.start,
        end: event.end ?? undefined,
        allDay: event.allDay,
        description: event.description ?? undefined,
        location: event.location ?? undefined,
        organizerName: organizer?.name,
        organizerEmail: organizer?.email,
        attendees: icsAttendees,
        method: "REQUEST",
        sequence: 0,
      });
      const { href, etag } = await putEvent(auth, conn.calendarUrl!, uid, ics);
      const prev = existingRefs.get(userId);
      if (prev) {
        await db.eventSyncRef.update({ where: { id: prev.id }, data: { href, etag } });
      } else {
        await db.eventSyncRef.create({ data: { eventId, userId, href, etag } });
      }
    } catch {
      /* un participante puede fallar sin afectar a los demás */
    }
  }
  await db.calendarEvent.update({ where: { id: eventId }, data: { syncedAt: new Date() } }).catch(() => {});
}

// Borra el evento de la app de los calendarios Synology donde se escribió.
export async function removeEventFromParticipants(eventId: string): Promise<void> {
  const refs = await db.eventSyncRef.findMany({
    where: { eventId },
    include: { user: { include: { calendarConnection: true } } },
  });
  for (const ref of refs) {
    const conn = ref.user.calendarConnection;
    if (!conn?.enabled) continue;
    try {
      await deleteEvent(authOf(conn), ref.href);
    } catch {
      /* best-effort */
    }
  }
}

const WINDOW_BACK_DAYS = 31;
const WINDOW_FWD_DAYS = 366;

// Trae a la app los eventos creados/editados/borrados en el Synology Calendar de un
// usuario (pull). Devuelve un resumen para diagnóstico.
export async function syncUserCalendar(conn: CalendarConnection): Promise<{ imported: number; updated: number; deleted: number; error?: string }> {
  if (!conn.enabled || !conn.calendarUrl) return { imported: 0, updated: 0, deleted: 0 };
  const now = new Date();
  const from = new Date(now.getTime() - WINDOW_BACK_DAYS * 86400000);
  const to = new Date(now.getTime() + WINDOW_FWD_DAYS * 86400000);
  let imported = 0, updated = 0, deleted = 0;

  try {
    const auth = authOf(conn);
    const remote = await queryEvents(auth, conn.calendarUrl, from, to);
    const seenUids = new Set<string>();

    for (const r of remote) {
      const parsed = parseIcs(r.ics)[0];
      if (!parsed) continue;
      seenUids.add(parsed.uid);

      const existing = await db.calendarEvent.findUnique({ where: { uid: parsed.uid }, select: { id: true, source: true } });
      if (!existing) {
        // Evento nuevo creado en Synology → lo importamos como propio del usuario.
        const created = await db.calendarEvent.create({
          data: {
            uid: parsed.uid,
            title: parsed.title,
            description: parsed.description,
            location: parsed.location,
            start: parsed.start,
            end: parsed.end,
            allDay: parsed.allDay,
            source: "synology",
            createdById: conn.userId,
            syncedAt: now,
            attendees: { create: [{ userId: conn.userId }] },
          },
        });
        await db.eventSyncRef.create({ data: { eventId: created.id, userId: conn.userId, href: r.href, etag: r.etag } });
        imported++;
      } else {
        // Mantener href/etag al día siempre.
        await db.eventSyncRef.upsert({
          where: { eventId_userId: { eventId: existing.id, userId: conn.userId } },
          create: { eventId: existing.id, userId: conn.userId, href: r.href, etag: r.etag },
          update: { href: r.href, etag: r.etag },
        });
        // Solo sobreescribimos contenido si el evento NACIÓ en Synology (los de la
        // app son la fuente de verdad y no se pisan, para no crear bucles).
        if (existing.source === "synology") {
          await db.calendarEvent.update({
            where: { id: existing.id },
            data: {
              title: parsed.title, description: parsed.description, location: parsed.location,
              start: parsed.start, end: parsed.end, allDay: parsed.allDay, syncedAt: now,
            },
          });
          updated++;
        }
      }
    }

    // Borrados: eventos de origen Synology de este usuario, dentro de la ventana,
    // que ya no están en el servidor → se eliminaron allá, los quitamos aquí.
    const localSyno = await db.calendarEvent.findMany({
      where: {
        source: "synology",
        createdById: conn.userId,
        start: { gte: from, lte: to },
        uid: { not: null },
      },
      select: { id: true, uid: true },
    });
    const toDelete = localSyno.filter((e) => e.uid && !seenUids.has(e.uid)).map((e) => e.id);
    if (toDelete.length) {
      await db.calendarEvent.deleteMany({ where: { id: { in: toDelete } } });
      deleted = toDelete.length;
    }

    await db.calendarConnection.update({ where: { id: conn.id }, data: { lastSyncAt: now, lastError: null } });
    return { imported, updated, deleted };
  } catch (e) {
    const error = e instanceof Error ? e.message : "error de sincronización";
    await db.calendarConnection.update({ where: { id: conn.id }, data: { lastSyncAt: now, lastError: error } }).catch(() => {});
    return { imported, updated, deleted, error };
  }
}

// Sondea TODAS las conexiones activas (lo llama el cron).
export async function syncAllCalendars(): Promise<{ users: number; imported: number; updated: number; deleted: number }> {
  const conns = await db.calendarConnection.findMany({ where: { enabled: true, NOT: { calendarUrl: null } } });
  let imported = 0, updated = 0, deleted = 0;
  for (const conn of conns) {
    const r = await syncUserCalendar(conn);
    imported += r.imported; updated += r.updated; deleted += r.deleted;
  }
  return { users: conns.length, imported, updated, deleted };
}
