import { colombianHolidays } from "@/lib/holidays-co";

// ── El motor de la CARGA POR SEMANA ─────────────────────────────────────────
// La tarjeta vieja sumaba TODAS las tareas abiertas de una persona —lo que vence mañana y lo
// que vence en octubre— y lo dividía por su capacidad semanal: con dos meses de trabajo
// abierto todo el mundo daba 200 % y el semáforo dejó de decir nada. Aquí el número vuelve a
// significar algo, con tres reglas:
//
//  1. Los minutos estimados de una tarea se REPARTEN entre sus días hábiles, de su inicio a
//     su entrega. Una tarea de 10 h con cinco días de plazo pesa 2 h diarias, no 10 h hoy.
//  2. Lo VENCIDO y sin terminar cae entero en la semana actual: el trabajo que no se hizo no
//     desaparece — se amontona en el ahora. Eso es lo que un 110 % debe significar.
//  3. La capacidad es la REAL de cada semana: los festivos colombianos y las citas/rodajes
//     donde la persona participa la encogen. Un lunes festivo convierte la semana de 40 h en
//     una de 32.
//
// Todo el módulo es puro (fechas entran, números salen) y trabaja en DÍAS DE BOGOTÁ: el
// servidor corre en UTC y sin esto una tarea que vence «hoy» a las 8 p. m. caería en mañana.

export type TareaCarga = {
  assigneeId: string;
  projectId: string | null;
  estimatedMinutes: number;
  startDate: Date | null;
  dueDate: Date | null;
};

export type EventoCarga = {
  userId: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
};

/** Reparto de una persona en una semana: total y desglose por proyecto. */
export type CargaSemana = {
  totalMin: number;
  porProyecto: Map<string, number>; // projectId ("" = sin proyecto) → minutos
};

const FMT_DIA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });

/** «YYYY-MM-DD» del día de Bogotá en que cae este instante. */
export function claveDia(d: Date): string {
  return FMT_DIA.format(d);
}

// Aritmética de días sobre claves: la clave se ancla a mediodía UTC para que sumar 24 h jamás
// salte un día por husos o cambios de hora (Colombia no tiene DST, pero el hábito protege).
const aFecha = (clave: string) => new Date(`${clave}T12:00:00.000Z`);
const aClave = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (clave: string, n: number) => {
  const d = aFecha(clave);
  d.setUTCDate(d.getUTCDate() + n);
  return aClave(d);
};
const diaSemana = (clave: string) => aFecha(clave).getUTCDay(); // 0=domingo … 6=sábado
const esFinDeSemana = (clave: string) => {
  const dw = diaSemana(clave);
  return dw === 0 || dw === 6;
};

/** El lunes de la semana que contiene este día. */
export function lunesDe(clave: string): string {
  return sumarDias(clave, -((diaSemana(clave) + 6) % 7));
}

/** Los N lunes consecutivos desde la semana de `hoy` (la actual primero). */
export function semanasDesde(hoy: Date, n: number): string[] {
  const primero = lunesDe(claveDia(hoy));
  return Array.from({ length: n }, (_, i) => sumarDias(primero, i * 7));
}

/** Festivos colombianos de los años que toca esta ventana, como claves de día. */
export function festivosDeVentana(semanas: string[]): Set<string> {
  const anios = new Set(semanas.map((s) => Number(s.slice(0, 4))));
  // La última semana puede pisar enero del año siguiente.
  anios.add(Number(sumarDias(semanas[semanas.length - 1] ?? claveDia(new Date()), 6).slice(0, 4)));
  const out = new Set<string>();
  for (const a of anios) for (const clave of colombianHolidays(a).keys()) out.add(clave);
  return out;
}

/** Días hábiles (ni fin de semana ni festivo) del intervalo INCLUSIVO, acotado por cordura. */
export function diasHabiles(desde: string, hasta: string, festivos: Set<string>): string[] {
  if (hasta < desde) return [];
  const out: string[] = [];
  let d = desde;
  for (let i = 0; i < 400 && d <= hasta; i++) {
    if (!esFinDeSemana(d) && !festivos.has(d)) out.push(d);
    d = sumarDias(d, 1);
  }
  return out;
}

/**
 * Reparte las tareas en las semanas de la ventana. Devuelve, por persona, un mapa
 * lunes → carga de esa semana. Las reglas duras:
 *  · lo vencido cae entero en la semana ACTUAL (regla 2 de arriba);
 *  · de una tarea en curso solo se reparte lo que queda: de HOY (no de su inicio histórico)
 *    a su entrega;
 *  · una tarea cuyo plazo no tiene ni un día hábil (fin de semana puro) pesa en la semana de
 *    su entrega — el trabajo existe aunque el calendario diga descanso.
 */
export function repartirCarga(
  tareas: TareaCarga[],
  semanas: string[],
  festivos: Set<string>,
  hoy: Date = new Date(),
): Map<string, Map<string, CargaSemana>> {
  const out = new Map<string, Map<string, CargaSemana>>();
  if (!semanas.length) return out;
  const hoyClave = claveDia(hoy);
  const semanaActual = semanas[0];
  const setSemanas = new Set(semanas);

  const sumar = (quien: string, lunes: string, proyecto: string, min: number) => {
    if (!setSemanas.has(lunes) || min <= 0) return;
    const porSemana = out.get(quien) ?? new Map<string, CargaSemana>();
    const celda = porSemana.get(lunes) ?? { totalMin: 0, porProyecto: new Map<string, number>() };
    celda.totalMin += min;
    celda.porProyecto.set(proyecto, (celda.porProyecto.get(proyecto) ?? 0) + min);
    porSemana.set(lunes, celda);
    out.set(quien, porSemana);
  };

  for (const t of tareas) {
    if (!t.assigneeId || !t.estimatedMinutes || t.estimatedMinutes <= 0) continue;
    const proyecto = t.projectId ?? "";
    let ini = t.startDate ? claveDia(t.startDate) : null;
    let fin = t.dueDate ? claveDia(t.dueDate) : null;
    if (!ini && !fin) {
      // Sin ninguna fecha (raro: la casa pone fecha a todo): pesa en la semana actual.
      sumar(t.assigneeId, semanaActual, proyecto, t.estimatedMinutes);
      continue;
    }
    ini = ini ?? fin!;
    fin = fin ?? ini;
    if (fin < ini) [ini, fin] = [fin, ini];

    // Vencida: todo lo pendiente se amontona en la semana actual.
    if (fin < hoyClave) {
      sumar(t.assigneeId, semanaActual, proyecto, t.estimatedMinutes);
      continue;
    }
    // En curso: lo que queda se reparte de HOY a la entrega, no desde su inicio histórico.
    const desde = ini < hoyClave ? hoyClave : ini;
    const dias = diasHabiles(desde, fin, festivos);
    if (!dias.length) {
      sumar(t.assigneeId, lunesDe(fin), proyecto, t.estimatedMinutes);
      continue;
    }
    const porDia = t.estimatedMinutes / dias.length;
    for (const dia of dias) sumar(t.assigneeId, lunesDe(dia), proyecto, porDia);
  }
  return out;
}

export type CapacidadSemana = {
  capacidadMin: number; // la real, ya descontada
  baseMin: number; // la nominal de la persona
  festivos: number; // días festivos hábiles que cayeron en la semana
  eventosMin: number; // minutos comprometidos en citas/rodajes
};

/**
 * La capacidad REAL de una semana: la nominal menos los festivos (un día festivo = un quinto
 * de la semana) y menos las citas/rodajes en días hábiles. Un evento de día completo pesa un
 * día entero; uno con horas pesa su duración, con techo de un día — una cita mal cerrada de
 * 3 días no puede dejar la semana en negativo.
 */
export function capacidadSemana(
  capHoras: number,
  lunes: string,
  festivos: Set<string>,
  eventos: EventoCarga[],
  userId: string,
): CapacidadSemana {
  const baseMin = Math.max(0, capHoras) * 60;
  const porDia = baseMin / 5;
  const finSemana = sumarDias(lunes, 6);

  let festivosDias = 0;
  for (let i = 0; i < 5; i++) {
    if (festivos.has(sumarDias(lunes, i))) festivosDias += 1;
  }

  let eventosMin = 0;
  for (const e of eventos) {
    if (e.userId !== userId) continue;
    const dia = claveDia(e.start);
    if (dia < lunes || dia > finSemana || esFinDeSemana(dia) || festivos.has(dia)) continue;
    if (e.allDay || !e.end) {
      eventosMin += porDia;
    } else {
      const dur = Math.max(0, (e.end.getTime() - e.start.getTime()) / 60_000);
      eventosMin += Math.min(dur, porDia);
    }
  }

  const capacidadMin = Math.max(0, baseMin - festivosDias * porDia - eventosMin);
  return { capacidadMin, baseMin, festivos: festivosDias, eventosMin: Math.round(eventosMin) };
}
