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
  rrule: string | null; // regla de repetición cruda (RFC 5545), si la trae
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

// La app guarda las fechas como "hora de pared en UTC" (los campos UTC del Date son la hora
// de Bogotá). El .ics entrante trae el INSTANTE real (UTC, con Z), así que al guardarlo se le
// restan 5 h para dejar la hora de pared en los campos UTC. Una hora "flotante" (sin Z) ya ES
// hora de pared, se guarda tal cual. Colombia = UTC-5 sin horario de verano.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

// Parsea una fecha iCal. Soporta: 20260616T130000Z (UTC real → hora de pared),
// 20260616T130000 (flotante = ya es hora de pared) y 20260616 (solo fecha).
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
  // Con Z = instante real → a hora de pared (resta 5 h). Sin Z = ya es hora de pared.
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  return { date: new Date(z ? utcMs - BOGOTA_OFFSET_MS : utcMs), allDay: false };
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
          rrule: cur.rrule ?? null,
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
      case "RRULE": cur.rrule = value.trim(); break;
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

// ── Expansión de repeticiones (RRULE) ────────────────────────────────────────
type Rule = { freq: string; interval: number; count: number | null; until: Date | null; byday: number[] };
const DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function parseRule(rrule: string): Rule | null {
  const parts: Record<string, string> = {};
  for (const kv of rrule.split(";")) {
    const eq = kv.indexOf("=");
    if (eq !== -1) parts[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
  }
  if (!parts.FREQ) return null;
  const until = parts.UNTIL ? parseIcsDate(parts.UNTIL, parts.UNTIL.length === 8)?.date ?? null : null;
  const byday = (parts.BYDAY ?? "").split(",").map((d) => DOW[d.replace(/^[+-]?\d*/, "").toUpperCase()]).filter((n) => n !== undefined);
  return {
    freq: parts.FREQ.toUpperCase(),
    interval: Math.max(1, Number(parts.INTERVAL) || 1),
    count: parts.COUNT ? Number(parts.COUNT) : null,
    until,
    byday,
  };
}

const MAX_OCCURRENCES = 366; // tope de seguridad para no generar series infinitas

// Expande un evento (posiblemente recurrente) en ocurrencias concretas dentro de la
// ventana [from, to]. Sin RRULE devuelve el propio evento. Cada ocurrencia recibe un
// uid propio (uidBase_YYYYMMDDTHHMMSS) para guardarse como evento independiente.
export function expandRecurrence(ev: ParsedEvent, from: Date, to: Date): ParsedEvent[] {
  if (!ev.rrule) return [ev];
  const rule = parseRule(ev.rrule);
  if (!rule) return [ev];

  const durationMs = ev.end ? ev.end.getTime() - ev.start.getTime() : 0;
  const out: ParsedEvent[] = [];
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;

  const push = (start: Date) => {
    if (start > to) return false;
    if (rule.until && start > rule.until) return false;
    if (start >= from) {
      out.push({
        ...ev,
        uid: `${ev.uid}_${stamp(start)}`,
        start: new Date(start),
        end: durationMs ? new Date(start.getTime() + durationMs) : null,
        rrule: null,
      });
    }
    return true;
  };

  let emitted = 0;
  const cap = rule.count ?? MAX_OCCURRENCES;
  let cursor = new Date(ev.start);
  let iterations = 0;

  while (emitted < cap && iterations < MAX_OCCURRENCES * 2) {
    iterations++;
    if (rule.freq === "WEEKLY" && rule.byday.length) {
      // Semana con días concretos: emite cada día solicitado de esta semana.
      const weekStart = new Date(cursor);
      weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
      let stop = false;
      for (const dow of [...rule.byday].sort((a, b) => a - b)) {
        const day = new Date(weekStart);
        day.setUTCDate(weekStart.getUTCDate() + dow);
        day.setUTCHours(ev.start.getUTCHours(), ev.start.getUTCMinutes(), ev.start.getUTCSeconds(), 0);
        if (day < ev.start) continue; // antes del inicio de la serie
        if (emitted >= cap) { stop = true; break; }
        const cont = push(day);
        if (!cont) { stop = true; break; }
        emitted++;
      }
      if (stop && (out.length === 0 || out[out.length - 1].start > to)) break;
      if (rule.until && weekStart > rule.until && out.length) break;
      cursor.setUTCDate(cursor.getUTCDate() + 7 * rule.interval);
      if (cursor > to && (!rule.until || cursor > rule.until)) break;
      continue;
    }

    const cont = push(cursor);
    if (!cont) break;
    if (cursor >= ev.start) emitted++;

    if (rule.freq === "DAILY") cursor.setUTCDate(cursor.getUTCDate() + rule.interval);
    else if (rule.freq === "WEEKLY") cursor.setUTCDate(cursor.getUTCDate() + 7 * rule.interval);
    else if (rule.freq === "MONTHLY") cursor.setUTCMonth(cursor.getUTCMonth() + rule.interval);
    else if (rule.freq === "YEARLY") cursor.setUTCFullYear(cursor.getUTCFullYear() + rule.interval);
    else break; // frecuencia no soportada → solo la primera
  }
  // Garantiza al menos la primera aparición aunque caiga fuera de ventana hacia atrás.
  return out.length ? out : [{ ...ev, rrule: null }];
}
