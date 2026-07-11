// Enlaces «Añadir a calendario» para una sola cita/tarea, sin conexión previa ni OAuth:
//  - Google Calendar y Outlook web → URL de "nuevo evento" precargado,
//  - Apple / cualquier otro → descarga de un .ics.
// Usa la MISMA conversión de zona horaria que el resto del sistema (toInstant, +5 h): la app
// guarda "hora de pared en UTC" y el calendario destino necesita el instante real.
import { buildIcs, icsDate, icsDateOnly, toInstant } from "./ics";

export type CalExport = {
  uid?: string;
  title: string;
  start: Date; // hora de pared en UTC (los campos UTC son la hora de Bogotá)
  end?: Date | null;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const pad = (n: number) => String(n).padStart(2, "0");
// "YYYY-MM-DD" a partir de los campos UTC (día de pared) — para eventos de todo el día en Outlook.
function wallDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function endOrDefault(e: CalExport): Date {
  if (e.end) return e.end;
  return e.allDay ? new Date(e.start.getTime() + DAY_MS) : new Date(e.start.getTime() + HOUR_MS);
}

// Google: dates=INICIO/FIN. Con hora → instante UTC (YYYYMMDDTHHMMSSZ); todo el día → fecha
// (YYYYMMDD) con fin exclusivo (día siguiente).
export function googleCalUrl(e: CalExport): string {
  const end = endOrDefault(e);
  const dates = e.allDay
    ? `${icsDateOnly(e.start)}/${icsDateOnly(end)}`
    : `${icsDate(toInstant(e.start))}/${icsDate(toInstant(end))}`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates });
  if (e.description) p.set("details", e.description);
  if (e.location) p.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// Outlook web (Office 365): compositor de evento nuevo precargado.
export function outlookCalUrl(e: CalExport): string {
  const end = endOrDefault(e);
  const p = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: e.title });
  if (e.allDay) {
    p.set("allday", "true");
    p.set("startdt", wallDateOnly(e.start));
    p.set("enddt", wallDateOnly(end));
  } else {
    p.set("startdt", toInstant(e.start).toISOString());
    p.set("enddt", toInstant(end).toISOString());
  }
  if (e.description) p.set("body", e.description);
  if (e.location) p.set("location", e.location);
  return `https://outlook.office.com/calendar/0/deeplink/compose?${p.toString()}`;
}

// Texto .ics de un solo evento (descarga para Apple Calendar y cualquier otro cliente). Sin
// alarma (reminderMinutes: null): el recordatorio ya lo maneja la app, no lo duplicamos aquí.
export function icsText(e: CalExport): string {
  return buildIcs({
    uid: e.uid ?? `export-${e.start.getTime()}@labstreamsas.com`,
    title: e.title,
    start: e.start,
    end: e.end ?? undefined,
    allDay: e.allDay,
    description: e.description ?? undefined,
    location: e.location ?? undefined,
    method: "PUBLISH",
    reminderMinutes: null,
  });
}

// Dispara la descarga del .ics en el navegador (solo cliente).
export function downloadIcs(e: CalExport): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([icsText(e)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${e.title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60) || "cita"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
