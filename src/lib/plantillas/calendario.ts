import { colombianHolidays } from "@/lib/holidays-co";

// ── Planificar una plantilla HACIA ATRÁS desde sus fechas reales ────────────
// Hasta ahora, crear un proyecto desde plantilla dejaba TODAS las tareas empezando y
// venciendo hoy: a las 12 horas contaban como atrasadas, el semáforo se iba a rojo y el
// equipo aprendió a ignorarlo. Aquí cada tarea de la plantilla declara a qué HITO se ancla
// (la entrega, o el rodaje si lo hay), a cuántos días hábiles del hito vence y cuántos dura
// — y con las dos fechas reales el cronograma completo sale solo, en días hábiles de Bogotá
// y saltando festivos colombianos.
//
// Regla de compresión: si el plazo no alcanza (la entrega es pasado mañana y la plantilla
// pide dos semanas), NADA nace en el pasado — lo que caería antes de hoy se comprime a hoy
// y se AVISA. Un proyecto apretado es un hecho; un proyecto que nace vencido es un error.

export type TareaProgramable = {
  title: string;
  /** A qué hito se ancla el VENCIMIENTO. Sin ancla ni offset → tarea sin calendario propio. */
  ancla?: "entrega" | "rodaje";
  /** Días HÁBILES del vencimiento respecto al hito: -3 = tres días hábiles antes; 0 = el día. */
  offsetDias?: number;
  /** Cuántos días hábiles ocupa (≥1). El inicio sale de restarle esto al vencimiento. */
  duracionDias?: number;
  estimatedMinutes?: number;
  role?: string;
};

export type TareaProgramada = {
  title: string;
  /** «YYYY-MM-DD» — null si la tarea no declara calendario (caerá en el día de creación). */
  inicio: string | null;
  fin: string | null;
  estimatedMinutes: number | null;
  role: string | null;
  comprimida: boolean;
};

export type PlanPlantilla = {
  tareas: TareaProgramada[];
  /** Cosas que quien crea debe saber ANTES de crear, en cristiano. */
  avisos: string[];
};

const aFecha = (clave: string) => new Date(`${clave}T12:00:00.000Z`);
const aClave = (d: Date) => d.toISOString().slice(0, 10);
const diaSemana = (clave: string) => aFecha(clave).getUTCDay();
const esFinDeSemana = (clave: string) => diaSemana(clave) === 0 || diaSemana(clave) === 6;

export function festivosDeFechas(...claves: string[]): Set<string> {
  return festivosDe(...claves);
}

function festivosDe(...claves: string[]): Set<string> {
  const anios = new Set(claves.filter(Boolean).map((c) => Number(c.slice(0, 4))));
  const out = new Set<string>();
  for (const a of anios) {
    for (const clave of colombianHolidays(a).keys()) out.add(clave);
    for (const clave of colombianHolidays(a + 1).keys()) out.add(clave);
  }
  return out;
}

const esHabil = (clave: string, festivos: Set<string>) => !esFinDeSemana(clave) && !festivos.has(clave);

/** El día hábil más cercano ≤ clave (para anclar a un hito que cae en festivo/finde). */
function habilOAntes(clave: string, festivos: Set<string>): string {
  let d = clave;
  for (let i = 0; i < 15 && !esHabil(d, festivos); i++) d = sumar(d, -1);
  return d;
}

function sumar(clave: string, dias: number): string {
  const d = aFecha(clave);
  d.setUTCDate(d.getUTCDate() + dias);
  return aClave(d);
}

/** Suma N días HÁBILES (negativo = hacia atrás). 0 devuelve el mismo día (o el hábil previo). */
export function sumarHabiles(clave: string, n: number, festivos: Set<string>): string {
  let d = habilOAntes(clave, festivos);
  const paso = n >= 0 ? 1 : -1;
  let restan = Math.abs(n);
  for (let i = 0; i < 600 && restan > 0; i++) {
    d = sumar(d, paso);
    if (esHabil(d, festivos)) restan -= 1;
  }
  return d;
}

/**
 * Programa las tareas de una plantilla contra las fechas reales. `hoy` es el suelo: nada
 * nace en el pasado, lo que no cabe se comprime y se avisa.
 */
export function programarPlantilla(
  tareas: TareaProgramable[],
  fechas: { entrega: string; rodaje?: string | null; hoy: string },
): PlanPlantilla {
  const festivos = festivosDe(fechas.entrega, fechas.rodaje ?? "", fechas.hoy);
  const avisos: string[] = [];

  // Los hitos en día no laborable se avisan una sola vez, aquí — no por cada tarea anclada.
  if (!esHabil(fechas.entrega, festivos)) {
    avisos.push(
      esFinDeSemana(fechas.entrega)
        ? "La fecha de entrega cae en fin de semana: las tareas se acomodan al viernes anterior."
        : "La fecha de entrega cae en festivo: las tareas se acomodan al día hábil anterior.",
    );
  }
  if (fechas.rodaje && !esHabil(fechas.rodaje, festivos)) {
    avisos.push("El rodaje cae en día no laborable. Se puede grabar igual, pero revísalo: la capacidad del equipo esa semana no lo descuenta.");
  }
  if (fechas.rodaje && fechas.rodaje > fechas.entrega) {
    avisos.push("El rodaje quedó DESPUÉS de la entrega: revisa las fechas, así el plan no cierra.");
  }

  let comprimidas = 0;
  const out: TareaProgramada[] = tareas.map((t) => {
    const sinCalendario = t.ancla === undefined && t.offsetDias === undefined && t.duracionDias === undefined;
    if (sinCalendario) {
      return { title: t.title, inicio: null, fin: null, estimatedMinutes: t.estimatedMinutes ?? null, role: t.role ?? null, comprimida: false };
    }
    // El rodaje como ancla solo existe si hay fecha de rodaje; si no, todo ancla a la entrega.
    const hito = t.ancla === "rodaje" && fechas.rodaje ? fechas.rodaje : fechas.entrega;
    // El día del RODAJE es sagrado: la tarea anclada a él con offset 0 cae ESE día aunque sea
    // sábado (se graba cuando el cliente puede). La entrega sí se acomoda al hábil anterior.
    const esDiaDeRodaje = t.ancla === "rodaje" && !!fechas.rodaje && (t.offsetDias ?? 0) === 0;
    let fin = esDiaDeRodaje ? hito : sumarHabiles(hito, t.offsetDias ?? 0, festivos);
    const dur = Math.max(1, t.duracionDias ?? 1);
    let inicio = esDiaDeRodaje && dur === 1 ? fin : sumarHabiles(fin, -(dur - 1), festivos);

    // Suelo de HOY: nada nace vencido. Se comprime y se cuenta para avisar.
    let comprimida = false;
    if (fin < fechas.hoy) {
      fin = fechas.hoy;
      comprimida = true;
    }
    if (inicio < fechas.hoy) {
      inicio = fechas.hoy;
      comprimida = comprimida || dur > 1;
    }
    if (inicio > fin) inicio = fin;
    if (comprimida) comprimidas += 1;

    return { title: t.title, inicio, fin, estimatedMinutes: t.estimatedMinutes ?? null, role: t.role ?? null, comprimida };
  });

  if (comprimidas > 0) {
    avisos.push(
      comprimidas === 1
        ? "Una tarea no cabe en el plazo y quedó comprimida a hoy: el calendario va a estar apretado."
        : `${comprimidas} tareas no caben en el plazo y quedaron comprimidas a hoy: el calendario va a estar apretado.`,
    );
  }

  return { tareas: out, avisos };
}
