import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { buildIcs, type IcsAttendee } from "@/lib/ics";
import { parseIcs, expandRecurrence } from "@/lib/ics-parse";
import { putEvent, deleteEvent, queryEvents, type CalDavAuth } from "@/lib/caldav-client";
import { isEmailEnabled, sendEmail } from "@/lib/email";
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
      guests: { select: { email: true, name: true } },
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
  // Lista de ATTENDEE para el .ics: internos + invitados externos (clientes).
  const icsAttendees: IcsAttendee[] = [
    ...[...participants.values()].map((p) => ({ email: p.email, name: p.name })),
    ...event.guests.map((g) => ({ email: g.email, name: g.name ?? undefined })),
  ];
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

const dateLabel = (d: Date, allDay: boolean) =>
  allDay
    ? d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : d.toLocaleString("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

// Envía la invitación .ics (METHOD:REQUEST) por correo a los invitados externos
// indicados (clientes, etc.). Si `onlyEmails` se pasa, solo a esos; si no, a todos.
// Best-effort: nunca rompe el flujo. Devuelve cuántos correos salieron.
export async function sendGuestInvites(eventId: string, onlyEmails?: string[]): Promise<number> {
  if (!(await isEmailEnabled())) return 0;
  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
    include: {
      createdBy: { select: { name: true, email: true } },
      attendees: { include: { user: { select: { name: true, email: true } } } },
      guests: { select: { email: true, name: true } },
    },
  });
  if (!event) return 0;
  const targets = onlyEmails
    ? event.guests.filter((g) => onlyEmails.includes(g.email))
    : event.guests;
  if (targets.length === 0) return 0;

  const uid = event.uid ?? appUid(event.id);
  // Todos los participantes (internos + invitados) aparecen como ATTENDEE.
  const allAttendees: IcsAttendee[] = [
    ...event.attendees.filter((a) => a.user.email).map((a) => ({ email: a.user.email, name: a.user.name })),
    ...event.guests.map((g) => ({ email: g.email, name: g.name ?? undefined })),
  ];
  const when = dateLabel(event.start, event.allDay) + (!event.allDay && event.end ? `–${event.end.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}` : "");
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));

  let sent = 0;
  for (const g of targets) {
    const ics = buildIcs({
      uid,
      title: event.title,
      start: event.start,
      end: event.end ?? undefined,
      allDay: event.allDay,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      organizerName: event.createdBy?.name,
      organizerEmail: event.createdBy?.email ?? undefined,
      attendees: allAttendees,
      method: "REQUEST",
      sequence: 0,
    });
    const r = await sendEmail({
      to: g.email,
      from: event.createdBy?.email ? `${event.createdBy.name} <${event.createdBy.email}>` : undefined,
      replyTo: event.createdBy?.email ?? undefined,
      subject: `Invitación: ${event.title}`,
      html:
        `<p>Hola${g.name ? ` ${esc(g.name)}` : ""},</p>` +
        `<p>Te invitamos a <b>${esc(event.title)}</b>.</p>` +
        `<p><b>Cuándo:</b> ${esc(when)}</p>` +
        (event.location ? `<p><b>Dónde / enlace:</b> ${esc(event.location)}</p>` : "") +
        (event.description ? `<p>${esc(event.description)}</p>` : "") +
        `<p>Adjuntamos la invitación de calendario (.ics) para que la agregues a tu calendario.</p>`,
      text: `Invitación: ${event.title}\n${when}${event.location ? `\n${event.location}` : ""}\n\nAdjuntamos un .ics para tu calendario.`,
      attachments: [{ filename: "invitacion.ics", content: ics, contentType: "text/calendar; method=REQUEST" }],
    });
    if (r.ok) sent++;
  }
  return sent;
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

// Quita el evento del Synology de ciertos usuarios (p. ej. asistentes retirados al
// editar) y elimina sus referencias de sincronización.
export async function removeEventForUsers(eventId: string, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  const refs = await db.eventSyncRef.findMany({
    where: { eventId, userId: { in: userIds } },
    include: { user: { include: { calendarConnection: true } } },
  });
  for (const ref of refs) {
    const conn = ref.user.calendarConnection;
    if (conn?.enabled) {
      try { await deleteEvent(authOf(conn), ref.href); } catch { /* best-effort */ }
    }
  }
  await db.eventSyncRef.deleteMany({ where: { eventId, userId: { in: userIds } } });
}

const WINDOW_BACK_DAYS = 31;
const WINDOW_FWD_DAYS = 366;

// expandRecurrence (ics-parse) reescribe el UID de cada ocurrencia como
// `${baseUid}_YYYYMMDDTHHMMSS`. Para reconciliar borrados NO podemos comparar esos
// UID sintéticos contra una ventana deslizante (una ocurrencia fuera de ventana
// parecería "borrada en el servidor" y se eliminaría/recrearía en bucle). Por eso
// reconciliamos por UID BASE: derivamos el UID base quitando el sufijo de stamp.
// El stamp solo se añade a series recurrentes; un evento simple conserva su UID.
const OCCURRENCE_SUFFIX = /_\d{8}T\d{6}$/;
function baseUidOf(uid: string): string {
  return uid.replace(OCCURRENCE_SUFFIX, "");
}

// Trae a la app los eventos creados/editados/borrados en el Synology Calendar de un
// usuario (pull). Devuelve un resumen para diagnóstico.
export async function syncUserCalendar(conn: CalendarConnection): Promise<{ imported: number; updated: number; deleted: number; error?: string; skippedDeletes?: boolean; skipReason?: string }> {
  if (!conn.enabled || !conn.calendarUrl) return { imported: 0, updated: 0, deleted: 0 };
  const now = new Date();
  const from = new Date(now.getTime() - WINDOW_BACK_DAYS * 86400000);
  const to = new Date(now.getTime() + WINDOW_FWD_DAYS * 86400000);
  let imported = 0, updated = 0, deleted = 0;

  try {
    const auth = authOf(conn);
    const remote = await queryEvents(auth, conn.calendarUrl, from, to);
    // UID exactos (incluidos los sintéticos de ocurrencias) que el servidor reporta:
    // se usa para upsert/import, no para borrar.
    const seenUids = new Set<string>();
    // UID BASE que el servidor reporta: la única base fiable para reconciliar
    // borrados (ver baseUidOf y la nota de B2 arriba).
    const seenBaseUids = new Set<string>();

    // Expande recurrentes a ocurrencias concretas dentro de la ventana.
    const occurrences = remote.events.flatMap((r) => {
      const base = parseIcs(r.ics)[0];
      if (!base) return [];
      return expandRecurrence(base, from, to).map((occ) => ({ occ, href: r.href, etag: r.etag }));
    });

    for (const { occ: parsed, href, etag } of occurrences) {
      seenUids.add(parsed.uid);
      seenBaseUids.add(baseUidOf(parsed.uid));

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
        await db.eventSyncRef.create({ data: { eventId: created.id, userId: conn.userId, href, etag } });
        imported++;
      } else {
        // Mantener href/etag al día siempre.
        await db.eventSyncRef.upsert({
          where: { eventId_userId: { eventId: existing.id, userId: conn.userId } },
          create: { eventId: existing.id, userId: conn.userId, href, etag },
          update: { href, etag },
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
    //
    // GUARDA B1 (no borrar ante respuesta incompleta/vacía/fallida):
    // Solo reconciliamos borrados si el REPORT fue un multistatus completo y bien
    // formado (`remote.complete`). Si el servidor respondió de forma rara, vacía o
    // parcial NO podemos afirmar qué eventos desaparecieron, así que NO borramos
    // nada en esta corrida. Además, como salvaguarda extra, si tenemos eventos
    // locales pero el servidor no devolvió NINGUNO, nos negamos a borrar en masa:
    // ese patrón "todo desaparece de golpe" es casi siempre un fallo de lectura,
    // no que el usuario haya vaciado su calendario entre dos sondeos.
    const localSyno = await db.calendarEvent.findMany({
      where: {
        source: "synology",
        createdById: conn.userId,
        start: { gte: from, lte: to },
        uid: { not: null },
      },
      select: { id: true, uid: true },
    });

    const reportComplete = remote.complete;
    const serverReturnedNothing = seenBaseUids.size === 0;
    const haveLocalEvents = localSyno.length > 0;
    // Negativa al borrado masivo sobre listado vacío (B1).
    const suspiciousEmptyWipe = serverReturnedNothing && haveLocalEvents;

    if (!reportComplete || suspiciousEmptyWipe) {
      // No tocamos nada: preferimos NUNCA borrar a borrar por error. Se registra
      // como skip para diagnóstico; los borrados reales se propagarán cuando el
      // servidor devuelva un listado completo.
      const reason = !reportComplete ? "respuesta REPORT incompleta" : "listado vacío con eventos locales";
      await db.calendarConnection.update({
        where: { id: conn.id },
        data: { lastSyncAt: now, lastError: null },
      });
      return { imported, updated, deleted, skippedDeletes: true, skipReason: reason };
    }

    // GUARDA B2 (reconciliar por UID BASE, no por UID de ocurrencia):
    // Un evento local solo se borra si su UID BASE está completamente ausente del
    // conjunto que reportó el servidor. Así, las ocurrencias de una serie recurrente
    // que caen fuera de la ventana deslizante NO se interpretan como "borradas".
    const toDelete = localSyno
      .filter((e) => e.uid && !seenBaseUids.has(baseUidOf(e.uid)))
      .map((e) => e.id);
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
