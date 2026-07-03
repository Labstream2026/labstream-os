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
function toInstant(d: Date): Date {
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

export function buildIcs(e: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Labstream OS//ES",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.method ?? "REQUEST"}`,
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

  lines.push("END:VEVENT", "END:VCALENDAR");
  // iCal exige CRLF.
  return lines.join("\r\n");
}
