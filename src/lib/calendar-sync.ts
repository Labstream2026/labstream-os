import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { buildIcs, type IcsAttendee } from "@/lib/ics";
import { parseIcs, expandRecurrence } from "@/lib/ics-parse";
import { putEvent, deleteEvent, queryEvents, discoverCalendars, type CalDavAuth, type RemoteEvent } from "@/lib/caldav-client";
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
  // Estado RSVP por usuario (PENDING|ACCEPTED|DECLINED|TENTATIVE) → PARTSTAT del .ics,
  // para que la respuesta dada en la app se VEA también en Synology.
  const rsvpByUser = new Map<string, string>();
  for (const a of event.attendees) {
    if (a.user.email) participants.set(a.user.id, { name: a.user.name, email: a.user.email });
    rsvpByUser.set(a.user.id, a.status);
  }
  const toPartstat = (s?: string) =>
    s === "ACCEPTED" || s === "DECLINED" || s === "TENTATIVE" ? s : "NEEDS-ACTION";
  // Lista de ATTENDEE para el .ics: internos (con su RSVP) + invitados externos (clientes).
  const icsAttendees: IcsAttendee[] = [
    ...[...participants.entries()].map(([id, p]) => ({ email: p.email, name: p.name, status: toPartstat(rsvpByUser.get(id)) })),
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
        // Recordatorio configurable de la cita → VALARM (null = sin alarma en Synology).
        reminderMinutes: event.reminderMinutes,
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
    : d.toLocaleString("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

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
  const when = dateLabel(event.start, event.allDay) + (!event.allDay && event.end ? `–${event.end.toLocaleTimeString("es-CO", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })}` : "");
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

// Envía un .ics de CANCELACIÓN (METHOD:CANCEL) por correo a los invitados externos de un
// evento que se va a borrar. Debe llamarse ANTES de eliminar el evento de la BD.
export async function sendEventCancellations(eventId: string): Promise<number> {
  if (!(await isEmailEnabled())) return 0;
  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
    include: {
      createdBy: { select: { name: true, email: true } },
      attendees: { include: { user: { select: { name: true, email: true } } } },
      guests: { select: { email: true, name: true } },
    },
  });
  if (!event || event.guests.length === 0) return 0;
  const uid = event.uid ?? appUid(event.id);
  const allAttendees: IcsAttendee[] = [
    ...event.attendees.filter((a) => a.user.email).map((a) => ({ email: a.user.email, name: a.user.name })),
    ...event.guests.map((g) => ({ email: g.email, name: g.name ?? undefined })),
  ];
  const when = dateLabel(event.start, event.allDay);
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  let sent = 0;
  for (const g of event.guests) {
    const ics = buildIcs({
      uid, title: event.title, start: event.start, end: event.end ?? undefined, allDay: event.allDay,
      description: event.description ?? undefined, location: event.location ?? undefined,
      organizerName: event.createdBy?.name, organizerEmail: event.createdBy?.email ?? undefined,
      attendees: allAttendees, method: "CANCEL", sequence: 1,
    });
    const r = await sendEmail({
      to: g.email,
      from: event.createdBy?.email ? `${event.createdBy.name} <${event.createdBy.email}>` : undefined,
      replyTo: event.createdBy?.email ?? undefined,
      subject: `Cancelada: ${event.title}`,
      html: `<p>Hola${g.name ? ` ${esc(g.name)}` : ""},</p><p>Se <b>canceló</b> la cita <b>${esc(event.title)}</b> que estaba para ${esc(when)}.</p><p>Adjuntamos la cancelación para que se quite de tu calendario.</p>`,
      text: `Cancelada: ${event.title}\n${when}`,
      attachments: [{ filename: "cancelacion.ics", content: ics, contentType: "text/calendar; method=CANCEL" }],
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
// Colombia = UTC−5 (sin horario de verano). La app guarda "hora de pared en UTC"; el instante
// real = pared + 5 h. Se usa para alinear la ventana de borrado local con la del servidor.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

// ── Sincronización de TAREAS/RODAJES del usuario hacia su Synology ─────────────
// Cada tarea abierta del usuario (responsable o dueño) con fecha de entrega o de
// rodaje se escribe como un evento de todo el día en SU calendario de Synology, para
// que vea sus pendientes ahí. UID determinista (task-/shoot-<id>) → no necesita tabla
// de refs: se reconcilia contra lo que el servidor ya reporta (PUT lo que cambió,
// DELETE lo que ya no corresponde: tarea completada, sin fecha o reasignada).
const TASK_UID_PREFIX = "task-";
const SHOOT_UID_PREFIX = "shoot-";
function isAppTaskUid(uid: string): boolean {
  return uid.startsWith(TASK_UID_PREFIX) || uid.startsWith(SHOOT_UID_PREFIX);
}
function sameUTCDate(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}
function taskDescription(t: { project: { name: string } | null; priority: string | null; description: string | null }): string {
  const bits: string[] = [];
  if (t.project?.name) bits.push(`Proyecto: ${t.project.name}`);
  if (t.priority) bits.push(`Prioridad: ${t.priority}`);
  const head = bits.join(" · ");
  return [head, t.description?.trim()].filter(Boolean).join("\n\n");
}

async function reconcileUserTasks(
  auth: CalDavAuth,
  conn: CalendarConnection,
  from: Date,
  to: Date,
  remoteTasks: Map<string, { start: Date; href: string }>,
): Promise<void> {
  const tasks = await db.task.findMany({
    where: {
      completedAt: null,
      AND: [
        { OR: [{ assigneeId: conn.userId }, { ownerId: conn.userId }] },
        { OR: [{ dueDate: { gte: from, lte: to } }, { shootDate: { gte: from, lte: to } }] },
      ],
    },
    select: { id: true, title: true, description: true, dueDate: true, shootDate: true, priority: true, project: { select: { name: true } } },
  });

  const desired = new Set<string>();
  const calUrl = conn.calendarUrl!;
  for (const t of tasks) {
    const desc = taskDescription(t);
    const proj = t.project?.name ? ` · ${t.project.name}` : "";
    const entries: { uid: string; title: string; date: Date }[] = [];
    if (t.dueDate) entries.push({ uid: `${TASK_UID_PREFIX}${t.id}@labstreamsas.com`, title: `✅ ${t.title}${proj}`, date: t.dueDate });
    if (t.shootDate) entries.push({ uid: `${SHOOT_UID_PREFIX}${t.id}@labstreamsas.com`, title: `🎬 Rodaje: ${t.title}${proj}`, date: t.shootDate });
    for (const e of entries) {
      desired.add(e.uid);
      const remote = remoteTasks.get(e.uid);
      // Solo se reescribe si no existe o cambió la fecha (evita PUTs redundantes cada 5 min).
      if (remote && sameUTCDate(remote.start, e.date)) continue;
      const ics = buildIcs({ uid: e.uid, title: e.title, start: e.date, allDay: true, description: desc || undefined, method: "PUBLISH" });
      try { await putEvent(auth, calUrl, e.uid, ics); } catch { /* best-effort por tarea */ }
    }
  }

  // Borra del Synology las entradas de tarea/rodaje que ya no corresponden.
  for (const [uid, info] of remoteTasks) {
    if (desired.has(uid)) continue;
    try { await deleteEvent(auth, info.href); } catch { /* best-effort */ }
  }
}

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
    // Sincroniza TODOS los calendarios del usuario en Synology (no solo el primario): así
    // cualquier calendario nuevo que cree allá también entra a la app. Si el descubrimiento
    // falla, cae al calendario configurado. Los eventos de todos se fusionan y la lógica de
    // import/borrado sigue igual (reconcilia por UID base sobre el conjunto completo).
    let calUrls: string[];
    // Si el descubrimiento NO fue fiable (falló o no devolvió colecciones) caemos al calendario
    // primario, pero entonces solo vemos una PARTE de los calendarios del usuario: reconciliar
    // borrados en ese estado eliminaría por error los eventos de las colecciones no consultadas.
    // Por eso lo tratamos igual que un REPORT incompleto (no borra en esta corrida).
    let discoveryReliable = true;
    try {
      const cals = await discoverCalendars(auth);
      if (cals.length) calUrls = cals.map((c) => c.url);
      else { calUrls = [conn.calendarUrl]; discoveryReliable = false; }
    } catch {
      calUrls = [conn.calendarUrl];
      discoveryReliable = false;
    }
    const mergedEvents: RemoteEvent[] = [];
    let mergedComplete = true;
    for (const url of calUrls) {
      try {
        const r = await queryEvents(auth, url, from, to);
        mergedEvents.push(...r.events);
        mergedComplete = mergedComplete && r.complete;
      } catch {
        // Si un calendario falla, no marcamos el pull como completo (no borrar por error).
        mergedComplete = false;
      }
    }
    const remote = { events: mergedEvents, complete: mergedComplete };
    // UID exactos (incluidos los sintéticos de ocurrencias) que el servidor reporta:
    // se usa para upsert/import, no para borrar.
    const seenUids = new Set<string>();
    // UID BASE que el servidor reporta: la única base fiable para reconciliar
    // borrados (ver baseUidOf y la nota de B2 arriba).
    const seenBaseUids = new Set<string>();
    // Entradas de TAREAS/RODAJES que la app ya escribió (uid task-/shoot-): se separan
    // del import (no son CalendarEvent) y se reconcilian aparte (reconcileUserTasks).
    const remoteTasks = new Map<string, { start: Date; href: string }>();

    // Expande recurrentes a ocurrencias concretas dentro de la ventana.
    const occurrences = remote.events.flatMap((r) => {
      const base = parseIcs(r.ics)[0];
      if (!base) return [];
      return expandRecurrence(base, from, to).map((occ) => ({ occ, href: r.href, etag: r.etag }));
    });

    for (const { occ: parsed, href, etag } of occurrences) {
      // Entradas de tarea/rodaje empujadas por la app: NO se reimportan como eventos
      // (evita duplicados y bucles); se guardan para reconciliar más abajo.
      if (isAppTaskUid(parsed.uid)) {
        remoteTasks.set(parsed.uid, { start: parsed.start, href });
        continue;
      }
      seenUids.add(parsed.uid);
      seenBaseUids.add(baseUidOf(parsed.uid));

      const existing = await db.calendarEvent.findUnique({ where: { uid: parsed.uid }, select: { id: true, source: true } });
      if (!existing) {
        // Evento nuevo creado en Synology → lo importamos como propio del usuario. UPSERT por uid
        // (no create): si el sondeo del scheduler y el del cron se solapan, ambos pueden ver
        // "no existe" a la vez; con create colisionarían en el índice único de uid (P2002).
        // reminderMinutes: null → NO duplicamos el aviso (Synology ya recuerda estos eventos).
        const created = await db.calendarEvent.upsert({
          where: { uid: parsed.uid },
          create: {
            uid: parsed.uid,
            title: parsed.title,
            description: parsed.description,
            location: parsed.location,
            start: parsed.start,
            end: parsed.end,
            allDay: parsed.allDay,
            source: "synology",
            createdById: conn.userId,
            reminderMinutes: null,
            syncedAt: now,
            attendees: { create: [{ userId: conn.userId }] },
          },
          update: { syncedAt: now },
          select: { id: true },
        });
        await db.eventSyncRef.upsert({
          where: { eventId_userId: { eventId: created.id, userId: conn.userId } },
          create: { eventId: created.id, userId: conn.userId, href, etag },
          update: { href, etag },
        });
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

    // Empuja/actualiza/borra las TAREAS y RODAJES del usuario en su Synology (idempotente).
    await reconcileUserTasks(auth, conn, from, to, remoteTasks).catch(() => {});

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
    // La columna `start` guarda HORA DE PARED (= instante real − 5 h), pero from/to son
    // instantes reales (así se consultó al servidor). Para elegir candidatos a borrado hay que
    // comparar en la MISMA escala: un evento de pared S estuvo en la ventana del servidor solo si
    // from ≤ S+5h ≤ to, es decir from−5h ≤ S ≤ to−5h. Sin esto, un evento en la banda de 5 h del
    // borde futuro se borraría por error (el servidor no lo devuelve pero su `start` sí cae ≤ to).
    const fromWall = new Date(from.getTime() - BOGOTA_OFFSET_MS);
    const toWall = new Date(to.getTime() - BOGOTA_OFFSET_MS);
    const localSyno = await db.calendarEvent.findMany({
      where: {
        source: "synology",
        createdById: conn.userId,
        start: { gte: fromWall, lte: toWall },
        uid: { not: null },
      },
      select: { id: true, uid: true },
    });

    const reportComplete = remote.complete;
    const serverReturnedNothing = seenBaseUids.size === 0;
    const haveLocalEvents = localSyno.length > 0;
    // Negativa al borrado masivo sobre listado vacío (B1).
    const suspiciousEmptyWipe = serverReturnedNothing && haveLocalEvents;

    if (!reportComplete || !discoveryReliable || suspiciousEmptyWipe) {
      // No tocamos nada: preferimos NUNCA borrar a borrar por error. Se registra
      // como skip para diagnóstico; los borrados reales se propagarán cuando el
      // servidor devuelva un listado completo.
      const reason = !reportComplete ? "respuesta REPORT incompleta" : !discoveryReliable ? "descubrimiento de calendarios no fiable" : "listado vacío con eventos locales";
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

// Sondea TODAS las conexiones activas (lo llaman el scheduler en-proceso y el cron del NAS).
// Candado en-proceso: scheduler y cron corren en el MISMO proceso Node; si se solapan, dos
// sondeos del mismo usuario colisionan (PUTs duplicados, y antes P2002). El guard evita la
// corrida concurrente; el que llega segundo sale sin hacer nada (el primero ya está sondeando).
export async function syncAllCalendars(): Promise<{ users: number; imported: number; updated: number; deleted: number }> {
  const g = globalThis as unknown as { __labstreamSyncing?: boolean };
  if (g.__labstreamSyncing) return { users: 0, imported: 0, updated: 0, deleted: 0 };
  g.__labstreamSyncing = true;
  try {
    const conns = await db.calendarConnection.findMany({ where: { enabled: true, NOT: { calendarUrl: null } } });
    let imported = 0, updated = 0, deleted = 0;
    for (const conn of conns) {
      const r = await syncUserCalendar(conn);
      imported += r.imported; updated += r.updated; deleted += r.deleted;
    }
    return { users: conns.length, imported, updated, deleted };
  } finally {
    g.__labstreamSyncing = false;
  }
}
