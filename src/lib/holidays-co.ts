// Festivos nacionales de Colombia. Combina los FIJOS, los de la "Ley Emiliani" (se trasladan
// al lunes siguiente si no caen en lunes) y los MÓVILES basados en la Pascua. Cálculo
// determinista por año (algoritmo de cómputo de la Pascua), sin llamadas de red.

function easterSunday(year: number): Date {
  // Algoritmo anónimo gregoriano (Meeus/Jones/Butcher).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setUTCDate(r.getUTCDate() + n); return r; };
// Ley Emiliani: si la fecha no cae en lunes, se traslada al lunes siguiente.
function toMonday(d: Date): Date {
  const diff = (1 - d.getUTCDay() + 7) % 7; // 0 si ya es lunes
  return diff === 0 ? d : addDays(d, diff);
}

// [mes (0-11), día, nombre]
const FIXED: [number, number, string][] = [
  [0, 1, "Año Nuevo"],
  [4, 1, "Día del Trabajo"],
  [6, 20, "Día de la Independencia"],
  [7, 7, "Batalla de Boyacá"],
  [11, 8, "Inmaculada Concepción"],
  [11, 25, "Navidad"],
];
const EMILIANI: [number, number, string][] = [
  [0, 6, "Reyes Magos"],
  [2, 19, "Día de San José"],
  [5, 29, "San Pedro y San Pablo"],
  [7, 15, "Asunción de la Virgen"],
  [9, 12, "Día de la Raza"],
  [10, 1, "Día de Todos los Santos"],
  [10, 11, "Independencia de Cartagena"],
];

const cache = new Map<number, Map<string, string>>();

// Mapa "YYYY-MM-DD" → nombre del festivo, para un año.
export function colombianHolidays(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const m = new Map<string, string>();
  for (const [mo, da, name] of FIXED) m.set(keyOf(new Date(Date.UTC(year, mo, da))), name);
  for (const [mo, da, name] of EMILIANI) m.set(keyOf(toMonday(new Date(Date.UTC(year, mo, da)))), name);
  const easter = easterSunday(year);
  m.set(keyOf(addDays(easter, -3)), "Jueves Santo");
  m.set(keyOf(addDays(easter, -2)), "Viernes Santo");
  m.set(keyOf(toMonday(addDays(easter, 39))), "Ascensión del Señor");
  m.set(keyOf(toMonday(addDays(easter, 60))), "Corpus Christi");
  m.set(keyOf(toMonday(addDays(easter, 68))), "Sagrado Corazón");
  cache.set(year, m);
  return m;
}

// Nombre del festivo para una fecha "YYYY-MM-DD", o null si ese día no es festivo en Colombia.
export function holidayName(dateKey: string): string | null {
  const year = Number(dateKey.slice(0, 4));
  if (!year) return null;
  return colombianHolidays(year).get(dateKey) ?? null;
}
