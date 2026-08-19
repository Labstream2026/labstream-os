import { bogotaYmd, utcFromBogota, ymdPlus } from "@/lib/reminder-schedule";

// ── Programar envío: presets y validación, en hora de BOGOTÁ ────────────────
// El navegador de cada quien no decide qué significa «mañana a las 8»: los presets se
// calculan aquí y el valor elegido (o escrito a mano) se valida aquí, con la zona fija del
// estudio. El valor viaja como pared de Bogotá («YYYY-MM-DDTHH:mm») — el mismo formato del
// <input type="datetime-local">, así el campo libre y los presets hablan igual.

export type PresetProgramacion = { etiqueta: string; detalle: string; valor: string };

const diaCorto = (ymd: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short" })
    .format(new Date(`${ymd}T12:00:00.000-05:00`))
    .replace(/\./g, "");

export function presetsProgramacion(nowMs: number): PresetProgramacion[] {
  const hoy = bogotaYmd(new Date(nowMs));
  const horaBogota = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", hour12: false }).format(new Date(nowMs)));
  const lista: PresetProgramacion[] = [];
  // «Hoy en la tarde» solo si todavía es de mañana — programar para hace una hora no existe.
  if (horaBogota < 13) lista.push({ etiqueta: "Hoy en la tarde", detalle: `${diaCorto(hoy)}, 2:00 p. m.`, valor: `${hoy}T14:00` });
  const manana = ymdPlus(hoy, 1);
  lista.push({ etiqueta: "Mañana en la mañana", detalle: `${diaCorto(manana)}, 8:00 a. m.`, valor: `${manana}T08:00` });
  // El próximo lunes (si hoy es lunes, el de la semana entrante) — mediodía UTC ancla el día.
  const dow = new Date(`${hoy}T12:00:00.000-05:00`).getUTCDay();
  const lunes = ymdPlus(hoy, ((8 - dow) % 7) || 7);
  lista.push({ etiqueta: "El lunes en la mañana", detalle: `${diaCorto(lunes)}, 8:00 a. m.`, valor: `${lunes}T08:00` });
  return lista;
}

const RE_VALOR = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;
const MAX_ADELANTE_MS = 366 * 24 * 3600_000;

/** Valor del formulario («YYYY-MM-DDTHH:mm», pared de Bogotá) → instante. null = inválido:
 *  mal formado, ya pasó (o pasa en menos de un minuto) o está a más de un año. */
export function validarProgramacion(valor: string, nowMs: number): Date | null {
  const m = RE_VALOR.exec(valor.trim());
  if (!m) return null;
  const d = utcFromBogota(m[1], m[2]);
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  if (t < nowMs + 60_000) return null;
  if (t > nowMs + MAX_ADELANTE_MS) return null;
  return d;
}

/** «sale el mié 20 ago, 08:00» — la etiqueta del toast y de la carpeta Programados. */
export function etiquetaSalida(d: Date): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(/\./g, "");
}
