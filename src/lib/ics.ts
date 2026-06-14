// Genera un archivo .ics (iCalendar VEVENT) para enviar invitaciones a clientes
// por correo. El cliente decide si lo agrega a SU calendario — nunca escribimos en él.

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Fecha en UTC formato iCal: YYYYMMDDTHHMMSSZ
export function icsDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export type IcsEvent = {
  uid: string;
  title: string;
  start: Date;
  end?: Date;
  description?: string;
  location?: string;
  organizerName?: string;
  organizerEmail?: string;
  attendeeEmail?: string;
  attendeeName?: string;
  method?: "REQUEST" | "PUBLISH" | "CANCEL";
};

export function buildIcs(e: IcsEvent): string {
  const end = e.end ?? new Date(e.start.getTime() + 60 * 60 * 1000); // +1h por defecto
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Labstream OS//ES",
    `METHOD:${e.method ?? "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(e.title)}`,
  ];
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  if (e.organizerEmail)
    lines.push(`ORGANIZER;CN=${esc(e.organizerName ?? "Labstream")}:mailto:${e.organizerEmail}`);
  if (e.attendeeEmail)
    lines.push(
      `ATTENDEE;CN=${esc(e.attendeeName ?? e.attendeeEmail)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${e.attendeeEmail}`,
    );
  lines.push("END:VEVENT", "END:VCALENDAR");
  // iCal exige CRLF
  return lines.join("\r\n");
}
