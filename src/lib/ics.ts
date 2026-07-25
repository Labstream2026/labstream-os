// Genera y parsea archivos .ics (iCalendar VEVENT). Se usa para:
//  - invitaciones por correo a clientes (METHOD:REQUEST),
//  - escribir eventos en el Synology Calendar del usuario vía CalDAV,
//  - leer de vuelta los eventos creados en Synology (parse).

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// La app guarda las fechas como "hora de pared en UTC": los campos UTC del Date SON la hora
// local de Bogotá (el contenedor corre en UTC y nada se convierte al crear). Para el .ics se
// necesita el INSTANTE real (UTC verdadero) = hora de pared + 5 h (Colombia = UTC-5, sin
// horario de verano). Sin esto, un evento de 4:00 p. m. saldría a las 11:00 en Synology/correo.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
// Convierte una "hora de pared en UTC" al instante real (UTC verdadero). Exportado para que los
// enlaces «Añadir a Google/Outlook» y el feed de suscripción usen la MISMA conversión que el .ics.
export function toInstant(d: Date): Date {
  return new Date(d.getTime() + BOGOTA_OFFSET_MS);
}

// Fecha-hora en UTC formato iCal: YYYYMMDDTHHMMSSZ
export function icsDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// Fecha (sin hora) formato iCal para eventos de todo el día: YYYYMMDD (en UTC).
export function icsDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// Plegado RFC 5545 §3.1: las líneas de más de 75 OCTETOS se parten con CRLF + espacio
// (descripciones/títulos largos). Google/Apple toleran líneas largas, pero clientes
// estrictos (Outlook viejo, validadores) las rechazan. Se cuenta en bytes UTF-8 con
// TextEncoder (este módulo también corre en el navegador — nada de Buffer) y se corta
// por caracteres completos para no partir un multibyte.
const utf8 = new TextEncoder();
function foldLine(line: string): string {
  if (utf8.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75; // la primera línea admite 75; las continuaciones 74 (el espacio inicial cuenta)
  for (const ch of line) {
    const b = utf8.encode(ch).length;
    if (curBytes + b > limit) { parts.push(cur); cur = ""; curBytes = 0; limit = 74; }
    cur += ch;
    curBytes += b;
  }
  if (cur) parts.push(cur);
  return parts.join("\r\n ");
}

// status: estado de respuesta del asistente (RSVP) → PARTSTAT del .ics.
//   NEEDS-ACTION (sin responder) · ACCEPTED · DECLINED · TENTATIVE.
export type IcsAttendee = { email: string; name?: string; status?: string };

export type IcsEvent = {
  uid: string;
  title: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
  description?: string;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
  // Compatibilidad: un solo asistente (correo a cliente)…
  attendeeEmail?: string;
  attendeeName?: string;
  // …o varios (sincronización de eventos de equipo).
  attendees?: IcsAttendee[];
  // Recordatorio (VALARM) en minutos antes del inicio. undefined = 15 (compatibilidad);
  // null = SIN recordatorio.
  reminderMinutes?: number | null;
  method?: "REQUEST" | "PUBLISH" | "CANCEL";
  // Marca de actualización; al subir cambios conviene incrementarla (Synology
  // respeta SEQUENCE para saber que es una versión más nueva).
  sequence?: number;
};

// Bloque VEVENT (sin el envoltorio VCALENDAR): reutilizado por buildIcs (un evento) y por
// buildIcsCalendar (feed de suscripción con muchos eventos en un solo VCALENDAR).
function veventLines(e: IcsEvent): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `SEQUENCE:${e.sequence ?? 0}`,
  ];

  if (e.allDay) {
    // Todo el día: DTSTART;VALUE=DATE y DTEND el día siguiente (exclusivo).
    const endDay = e.end ?? new Date(e.start.getTime() + 24 * 60 * 60 * 1000);
    lines.push(`DTSTART;VALUE=DATE:${icsDateOnly(e.start)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDateOnly(endDay)}`);
  } else {
    const end = e.end ?? new Date(e.start.getTime() + 60 * 60 * 1000); // +1h por defecto
    // toInstant: la hora guardada es "de pared en UTC"; el .ics necesita el instante real.
    lines.push(`DTSTART:${icsDate(toInstant(e.start))}`);
    lines.push(`DTEND:${icsDate(toInstant(end))}`);
  }

  lines.push(`SUMMARY:${esc(e.title)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.organizerEmail)
    lines.push(`ORGANIZER;CN=${esc(e.organizerName ?? "Labstream")}:mailto:${e.organizerEmail}`);

  const attendees: IcsAttendee[] = [
    ...(e.attendeeEmail ? [{ email: e.attendeeEmail, name: e.attendeeName }] : []),
    ...(e.attendees ?? []),
  ];
  for (const a of attendees) {
    const partstat = a.status || "NEEDS-ACTION";
    lines.push(
      `ATTENDEE;CN=${esc(a.name ?? a.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=${partstat};RSVP=TRUE:mailto:${a.email}`,
    );
  }

  // Estado del evento: cancelado (al borrar/cancelar) o confirmado.
  lines.push(`STATUS:${e.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`);

  // Recordatorio configurable (minutos antes) en eventos con hora. undefined = 15 min
  // (compatibilidad con llamadores viejos); null = la cita se creó SIN recordatorio.
  const reminder = e.reminderMinutes === undefined ? 15 : e.reminderMinutes;
  if (!e.allDay && reminder != null && reminder > 0) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${Math.round(reminder)}M`, "END:VALARM");
  }

  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(e: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Labstream OS//ES",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.method ?? "REQUEST"}`,
    ...veventLines(e),
    "END:VCALENDAR",
  ];
  // iCal exige CRLF; cada línea plegada a 75 octetos.
  return lines.map(foldLine).join("\r\n");
}

// Calendario de SUSCRIPCIÓN (feed webcal/ics): un solo VCALENDAR con MUCHOS VEVENT, para que
// Google/Apple/Outlook lo lean de solo lectura y lo refresquen periódicamente. METHOD:PUBLISH
// (no es una invitación). X-WR-CALNAME da el nombre visible; REFRESH-INTERVAL sugiere cada
// cuánto re-leer (los clientes lo respetan de forma laxa: Apple ~horas, Google ~1 día).
export function buildIcsCalendar(events: IcsEvent[], opts?: { calName?: string; refreshMinutes?: number }): string {
  const refresh = Math.max(15, Math.round(opts?.refreshMinutes ?? 60));
  const name = opts?.calName ?? "Labstream";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Labstream OS//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    `NAME:${esc(name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refresh}M`,
    `X-PUBLISHED-TTL:PT${refresh}M`,
    ...events.flatMap((e) => veventLines({ ...e, method: "PUBLISH" })),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n");
}
