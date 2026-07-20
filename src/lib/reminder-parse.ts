// ── Captura rápida de recordatorios: parser de lenguaje natural (español) ──
// PURO (sin BD y sin Date.now(): recibe `nowMs`). Reconoce fecha, hora y recurrencia dentro de
// un texto libre y devuelve el título limpio + los datos listos para crear el recordatorio.
// Todo se interpreta en HORA DE PARED DE BOGOTÁ (como el resto del sistema de recordatorios).
//
// Formas reconocidas (se pueden combinar):
//   Hora        «a las 9», «9:30», «7am», «3 pm», «9 de la noche», «mediodía», «por la tarde»
//   Fecha       «hoy», «mañana», «pasado mañana», «el viernes», «el 30», «el 5 de agosto»,
//               «esta tarde», «en 20 min», «en 2 horas», «en media hora»
//   Recurrencia «cada día», «todos los días», «cada lunes», «los lunes y viernes»,
//               «cada semana», «cada mes (el 30)»
// Lo que no se reconoce queda como parte del título; el formulario completo siempre está a un
// clic («Más opciones») para los casos que el parser no cubre.

// Import RELATIVO (no "@/") para que vitest lo resuelva sin config extra, igual que las demás libs testeadas.
import { utcFromBogota, ymdPlus, isValidYmd, WEEKDAY_LABELS } from "./reminder-schedule";

export type ParsedChip = { kind: "date" | "time" | "rec"; label: string; fallback?: boolean };

export type ParsedReminder = {
  title: string;
  /** ¿Se reconoció alguna fecha/hora/recurrencia explícita en el texto? */
  matched: boolean;
  chips: ParsedChip[];
  frequency: "UNA_VEZ" | "DIARIO" | "SEMANAL" | "MENSUAL";
  /** Solo UNA_VEZ: el aviso concreto ya resuelto. */
  alerts: { date: string; time: string }[];
  timeOfDay: string;
  weekdays: number[]; // 0=domingo (convención de reminder-schedule)
  dayOfMonth: number;
};

const bogDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });
const bogClock = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
const chipDate = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short" });

const WD_NAMES: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, "miércoles": 3, jueves: 4, viernes: 5, sabado: 6, "sábado": 6,
};
const WD_RX = "lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?";
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function wdOf(ymd: string): number {
  return new Date(`${ymd}T12:00:00.000Z`).getUTCDay();
}
function wdNum(token: string): number {
  const t = token.toLowerCase();
  return WD_NAMES[t] ?? WD_NAMES[t.replace(/s$/, "")] ?? 1;
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// El texto de trabajo va en minúsculas y cada tramo reconocido se "borra" (se reemplaza por
// espacios, mismo largo → los índices se mantienen) para que los pases siguientes no lo relean.
// Los rangos cortados se recuerdan para armar el título desde el texto ORIGINAL.
type Ctx = { work: string; cuts: { s: number; e: number }[] };
function cut(ctx: Ctx, m: { index: number } & ArrayLike<string>): void {
  const s = m.index;
  const e = m.index + m[0].length;
  ctx.work = ctx.work.slice(0, s) + " ".repeat(e - s) + ctx.work.slice(e);
  ctx.cuts.push({ s, e });
}

function humanDay(ymd: string, todayYmd: string): string {
  if (ymd === todayYmd) return "Hoy";
  if (ymd === ymdPlus(todayYmd, 1)) return "Mañana";
  if (ymd === ymdPlus(todayYmd, 2)) return "Pasado mañana";
  return chipDate.format(utcFromBogota(ymd, "12:00"));
}

export function parseReminderText(text: string, nowMs: number): ParsedReminder {
  const ctx: Ctx = { work: text.toLowerCase(), cuts: [] };
  const todayYmd = bogDay.format(new Date(nowMs));

  let time: string | null = null;
  let dateYmd: string | null = null;
  let dateLabel: string | null = null; // etiqueta especial para relativos («en 20 min»)

  const setTime = (h: number, mm: number, suffix?: string | null): boolean => {
    let hh = h;
    const s = (suffix ?? "").trim();
    if (/^p/.test(s) || /tarde|noche/.test(s)) { if (hh < 12) hh += 12; }
    else if (/^a/.test(s) && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return false;
    time = `${pad(hh)}:${pad(mm)}`;
    return true;
  };

  // ── 1) «en X min/horas» (fija fecha Y hora de una vez) ──
  {
    const m = /\ben\s+(una|media|\d{1,3})\s*(min(?:utos?)?|h\b|horas?)\b/.exec(ctx.work);
    if (m) {
      const qty = m[1] === "una" ? 1 : m[1] === "media" ? 0.5 : Number(m[1]);
      const isMin = /^min/.test(m[2]);
      const target = nowMs + (isMin ? qty * 60_000 : qty * 3_600_000);
      dateYmd = bogDay.format(new Date(target));
      time = bogClock.format(new Date(target));
      dateLabel = m[1] === "media" ? "en media hora" : isMin ? `en ${qty} min` : `en ${qty} ${qty === 1 ? "hora" : "horas"}`;
      cut(ctx, m);
    }
  }

  // ── 2) Hora ──
  if (!time) {
    const m = /\ba\s+las?\s+(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.?\s?m\.?|p\.?\s?m\.?|de\s+la\s+mañana|de\s+la\s+tarde|de\s+la\s+noche)?/.exec(ctx.work);
    if (m && setTime(Number(m[1]), Number(m[2] ?? 0), m[3])) cut(ctx, m);
  }
  if (!time) {
    const m = /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/.exec(ctx.work);
    if (m && setTime(Number(m[1]), Number(m[2]), m[3])) cut(ctx, m);
  }
  if (!time) {
    const m = /\b(\d{1,2})\s*(am|pm|a\.?m\.?|p\.?m\.?)\b/.exec(ctx.work);
    if (m && setTime(Number(m[1]), 0, m[2])) cut(ctx, m);
  }
  if (!time) {
    const m = /\b(\d{1,2})\s+de\s+la\s+(mañana|tarde|noche)\b/.exec(ctx.work);
    if (m && setTime(Number(m[1]), 0, m[2])) cut(ctx, m);
  }
  if (!time) {
    const m = /\b(?:al\s+)?mediod[ií]a\b/.exec(ctx.work);
    if (m) { time = "12:00"; cut(ctx, m); }
  }
  if (!time) {
    const m = /\b(?:a\s+)?medianoche\b/.exec(ctx.work);
    if (m) { time = "00:00"; cut(ctx, m); }
  }
  // Franjas: «esta tarde/noche/mañana» fijan HOY; «por/en la mañana…» solo la hora.
  {
    const m = /\besta\s+(mañana|tarde|noche)\b/.exec(ctx.work);
    if (m) {
      dateYmd = dateYmd ?? todayYmd;
      if (!time) time = m[1] === "mañana" ? "08:00" : m[1] === "tarde" ? "15:00" : "19:00";
      cut(ctx, m);
    }
  }
  {
    const m = /\b(?:por|en)\s+la\s+(mañana|tarde|noche)\b/.exec(ctx.work);
    if (m) {
      if (!time) time = m[1] === "mañana" ? "08:00" : m[1] === "tarde" ? "15:00" : "19:00";
      cut(ctx, m);
    }
  }

  // ── 3) Recurrencia ──
  let frequency: ParsedReminder["frequency"] = "UNA_VEZ";
  let weekdays: number[] = [];
  let dayOfMonth = Number(todayYmd.slice(8, 10));

  {
    const m = /\b(?:cada\s+d[ií]a|todos\s+los\s+d[ií]as|a\s+diario|diariamente)\b/.exec(ctx.work);
    if (m) { frequency = "DIARIO"; cut(ctx, m); }
  }
  if (frequency === "UNA_VEZ") {
    // «cada lunes», «todos los lunes», «los lunes y viernes»
    const m = new RegExp(`\\b(?:cada|todos\\s+los|los)\\s+((?:${WD_RX})(?:\\s*(?:,|y|e)\\s*(?:${WD_RX}))*)\\b`).exec(ctx.work);
    if (m) {
      frequency = "SEMANAL";
      const found = m[1].match(new RegExp(WD_RX, "g")) ?? [];
      weekdays = [...new Set(found.map(wdNum))];
      cut(ctx, m);
    }
  }
  if (frequency === "UNA_VEZ") {
    const m = /\b(?:cada\s+semana|semanalmente|semanal)\b/.exec(ctx.work);
    if (m) {
      frequency = "SEMANAL";
      cut(ctx, m);
      const wd = new RegExp(`\\b(?:el\\s+)?(${WD_RX})\\b`).exec(ctx.work);
      if (wd) { weekdays = [wdNum(wd[1])]; cut(ctx, wd); }
      else weekdays = [wdOf(todayYmd)];
    }
  }
  if (frequency === "UNA_VEZ") {
    const m = /\b(?:cada\s+mes|todos\s+los\s+meses|mensualmente|mensual)\b/.exec(ctx.work);
    if (m) {
      frequency = "MENSUAL";
      cut(ctx, m);
      // El día SOLO con prefijo explícito («el 30», «día 5») para no robar números del título.
      const dm = /\b(?:el|d[ií]a)\s+(\d{1,2})\b/.exec(ctx.work);
      if (dm && Number(dm[1]) >= 1 && Number(dm[1]) <= 31) { dayOfMonth = Number(dm[1]); cut(ctx, dm); }
    }
  }

  // ── 4) Fecha puntual (solo si no hay recurrencia) ──
  if (frequency === "UNA_VEZ" && !dateYmd) {
    {
      const m = /\bpasado\s+mañana\b/.exec(ctx.work);
      if (m) { dateYmd = ymdPlus(todayYmd, 2); cut(ctx, m); }
    }
    if (!dateYmd) {
      const m = /\bmañana\b/.exec(ctx.work);
      if (m) { dateYmd = ymdPlus(todayYmd, 1); cut(ctx, m); }
    }
    if (!dateYmd) {
      const m = /\bhoy\b/.exec(ctx.work);
      if (m) { dateYmd = todayYmd; cut(ctx, m); }
    }
    if (!dateYmd) {
      const m = new RegExp(`\\b(?:el\\s+pr[oó]ximo\\s+|el\\s+|este\\s+)?(${WD_RX})\\b`).exec(ctx.work);
      if (m) {
        const delta = ((wdNum(m[1]) - wdOf(todayYmd) + 7) % 7) || 7;
        dateYmd = ymdPlus(todayYmd, delta);
        cut(ctx, m);
      }
    }
    if (!dateYmd) {
      const m = new RegExp(`\\bel\\s+(\\d{1,2})\\s+de\\s+(${MONTH_NAMES.join("|")})\\b`).exec(ctx.work);
      if (m) {
        const d = Number(m[1]);
        const mo = MONTH_NAMES.indexOf(m[2]) + 1;
        const y = Number(todayYmd.slice(0, 4));
        let cand = `${y}-${pad(mo)}-${pad(d)}`;
        if (cand < todayYmd) cand = `${y + 1}-${pad(mo)}-${pad(d)}`;
        if (isValidYmd(cand)) { dateYmd = cand; cut(ctx, m); }
      }
    }
    if (!dateYmd) {
      const m = /\bel\s+(\d{1,2})\b(?!\s*[:.]\d)/.exec(ctx.work);
      if (m) {
        const d = Number(m[1]);
        if (d >= 1 && d <= 31) {
          const y = Number(todayYmd.slice(0, 4));
          const mo = Number(todayYmd.slice(5, 7));
          let cand = `${y}-${pad(mo)}-${pad(d)}`;
          if (cand <= todayYmd) cand = mo === 12 ? `${y + 1}-01-${pad(d)}` : `${y}-${pad(mo + 1)}-${pad(d)}`;
          if (isValidYmd(cand)) { dateYmd = cand; cut(ctx, m); }
        }
      }
    }
  }

  // ── 5) Armado ──
  const matched = ctx.cuts.length > 0;
  const chips: ParsedChip[] = [];
  let alerts: { date: string; time: string }[] = [];
  let timeOfDay = "08:00";

  if (frequency === "UNA_VEZ") {
    const tExplicit = time !== null;
    const dExplicit = dateYmd !== null;
    const t = time ?? "08:00";
    let d = dateYmd;
    if (!d) {
      // Solo hora: hoy si aún alcanza, si no mañana. Nada de nada: mañana.
      d = tExplicit && utcFromBogota(todayYmd, t).getTime() > nowMs + 60_000 ? todayYmd : ymdPlus(todayYmd, 1);
    }
    alerts = [{ date: d, time: t }];
    timeOfDay = t;
    chips.push({ kind: "date", label: dateLabel ?? humanDay(d, todayYmd), fallback: !dExplicit && !dateLabel });
    chips.push({ kind: "time", label: t, fallback: !tExplicit });
  } else {
    timeOfDay = time ?? "08:00";
    const recLabel =
      frequency === "DIARIO"
        ? "Cada día"
        : frequency === "SEMANAL"
          ? `Cada semana · ${weekdays.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_LABELS[d]).join(", ")}`
          : `Cada mes · día ${dayOfMonth}`;
    chips.push({ kind: "rec", label: recLabel });
    chips.push({ kind: "time", label: timeOfDay, fallback: time === null });
  }

  // Título = texto original sin los tramos reconocidos + limpieza de conectores colgantes.
  const sorted = ctx.cuts.slice().sort((a, b) => a.s - b.s);
  let title = "";
  let pos = 0;
  for (const c of sorted) {
    title += text.slice(pos, Math.max(pos, c.s));
    pos = Math.max(pos, c.e);
  }
  title += text.slice(pos);
  title = title.replace(/\s{2,}/g, " ").trim();
  const TRAIL = /(?:^|\s)(?:el|la|los|las|a|al|de|del|en|para|por|que|y|e|o|u)$|[,.·-]+$/i;
  let prev = "";
  while (prev !== title) {
    prev = title;
    title = title.replace(TRAIL, "").trim();
  }
  title = title.replace(/^[,.·\-\s]+/, "").trim();
  if (!title) title = text.trim();

  return { title, matched, chips, frequency, alerts, timeOfDay, weekdays, dayOfMonth };
}
