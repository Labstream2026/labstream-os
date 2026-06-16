// Parser mínimo de VEVENT (iCalendar) para traer eventos de Synology a la app.
// No pretende cubrir RRULE/VALARM/zonas completas: extrae lo necesario para
// mostrar la cita (uid, título, inicio/fin, todo el día, descripción, ubicación).

export type ParsedEvent = {
  uid: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  description: string | null;
  location: string | null;
  sequence: number;
};

// Des-pliega líneas continuadas (RFC 5545: una línea que empieza por espacio/tab
// continúa la anterior) y normaliza CRLF/LF.
function unfold(ics: string): string[] {
  const raw = ics.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescape(s: string): string {
  return s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

// Parsea una fecha iCal. Soporta: 20260616T130000Z (UTC), 20260616T130000
// (hora local/flotante → la tratamos como local) y 20260616 (solo fecha).
function parseIcsDate(value: string, isDateOnly: boolean): { date: Date; allDay: boolean } | null {
  const v = value.trim();
  if (isDateOnly || /^\d{8}$/.test(v)) {
    const y = +v.slice(0, 4), mo = +v.slice(4, 6), d = +v.slice(6, 8);
    if (!y) return null;
    return { date: new Date(Date.UTC(y, mo - 1, d, 0, 0, 0)), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  // Sin Z: hora "flotante" → la interpretamos como hora local del servidor app.
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
}

// Separa "NAME;PARAM=x:VALUE" en { name, params, value }.
function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...paramParts] = left.split(";");
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf("=");
    if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

// Extrae todos los VEVENT de un documento iCalendar (un .ics puede traer varios).
export function parseIcs(ics: string): ParsedEvent[] {
  const lines = unfold(ics);
  const events: ParsedEvent[] = [];
  let cur: Partial<ParsedEvent> & { _hasStart?: boolean } | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = { allDay: false, sequence: 0 }; continue; }
    if (line === "END:VEVENT") {
      if (cur && cur.uid && cur.title && cur._hasStart && cur.start) {
        events.push({
          uid: cur.uid,
          title: cur.title,
          start: cur.start,
          end: cur.end ?? null,
          allDay: cur.allDay ?? false,
          description: cur.description ?? null,
          location: cur.location ?? null,
          sequence: cur.sequence ?? 0,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const parsed = splitLine(line);
    if (!parsed) continue;
    const { name, params, value } = parsed;
    switch (name) {
      case "UID": cur.uid = value.trim(); break;
      case "SUMMARY": cur.title = unescape(value); break;
      case "DESCRIPTION": cur.description = unescape(value); break;
      case "LOCATION": cur.location = unescape(value); break;
      case "SEQUENCE": cur.sequence = Number(value) || 0; break;
      case "DTSTART": {
        const r = parseIcsDate(value, params.VALUE === "DATE");
        if (r) { cur.start = r.date; cur.allDay = r.allDay; cur._hasStart = true; }
        break;
      }
      case "DTEND": {
        const r = parseIcsDate(value, params.VALUE === "DATE");
        if (r) cur.end = r.date;
        break;
      }
    }
  }
  return events;
}
