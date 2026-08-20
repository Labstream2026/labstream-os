import { describe, it, expect } from "vitest";
import { taskToCalItems, coincidePersona } from "./build-items";
import { urgencyHex, urgencyHexCalendario } from "@/lib/task-urgency";
import { calTone } from "./calendar-detail";

// Una tarea HECHA se seguía pintando de rojo en el calendario al pasar su fecha: `taskUrgency`
// ya sabía devolver «hecha» y «hecha_tarde», pero `taskToCalItems` la llamaba solo con la fecha
// de entrega, así que el dato de completada nunca llegaba.
//
// Las aserciones comparan contra `urgencyHex(...)` en vez de contra un color escrito a mano: si
// mañana se cambia la paleta de urgencias, la prueba sigue midiendo lo que importa —qué ESTADO
// se le atribuye a la tarea— y no el hex de turno.

const ayer = new Date("2026-08-10T12:00:00.000Z");
const base = { id: "t1", title: "Reel 30 s", shootDate: null, dueDate: ayer };

describe("taskToCalItems · el color de una entrega", () => {
  it("pinta de vencida la que sigue abierta y ya pasó su fecha", () => {
    const [chip] = taskToCalItems({ ...base });
    expect(chip.urgencyHex).toBe(urgencyHex("vencida"));
  });

  it("pinta de hecha_tarde la que se completó DESPUÉS de su fecha", () => {
    const [chip] = taskToCalItems({ ...base, completedAt: new Date("2026-08-12T12:00:00.000Z") });
    expect(chip.urgencyHex).toBe(urgencyHex("hecha_tarde"));
    expect(chip.urgencyHex).not.toBe(urgencyHex("vencida"));
  });

  it("pinta de hecha la que se completó a tiempo", () => {
    const [chip] = taskToCalItems({ ...base, completedAt: new Date("2026-08-09T12:00:00.000Z") });
    expect(chip.urgencyHex).toBe(urgencyHex("hecha"));
  });

  it("NO le pone color propio a la que solo está lejos — se pinta como lo que es, una entrega", () => {
    const lejos = new Date(Date.now() + 30 * 86_400_000);
    const [chip] = taskToCalItems({ ...base, dueDate: lejos });
    expect(chip.urgencyHex).toBeUndefined();
  });

  it("no le cambia el color a la que no tiene fecha de entrega", () => {

    const [chip] = taskToCalItems({ ...base, dueDate: null, shootDate: ayer });
    // Sin dueDate no hay chip de entrega: el único que sale es el de rodaje, que no lleva color
    // de urgencia (un rodaje no vence).
    expect(chip.kind).toBe("shoot");
    expect(chip.urgencyHex).toBeUndefined();
  });
});

// El invariante que de verdad importa aquí, y el que se rompió sin que nadie lo notara: la
// urgencia y el TIPO se pintan en el mismo sitio (el color del bloque), así que si comparten un
// hex, la leyenda deja de ser cierta. Una entrega vencida salía con el rojo EXACTO del tipo
// «Rodaje»: en una llamada con el cliente se señala un bloque diciendo «ahí rodamos» y es un
// incumplimiento propio. Esta prueba no deja que vuelva a pasar con ningún par.
describe("los colores de urgencia no pueden chocar con los de tipo", () => {
  const TIPOS = ["event", "task", "shoot", "milestone"] as const;

  it("ningún color de urgencia que PINTE es igual al de un tipo", () => {
    const choques: string[] = [];
    for (const estado of ["vencida", "hoy", "hecha", "hecha_tarde"] as const) {
      const hex = urgencyHexCalendario(estado);
      for (const t of TIPOS) {
        if (hex && hex.toLowerCase() === calTone(t).solid.toLowerCase()) choques.push(`${estado} = ${t} (${hex})`);
      }
    }
    expect(choques).toEqual([]);
  });

  it("los estados intermedios no pintan: el color lo pone el tipo", () => {
    for (const estado of ["sin", "a_tiempo", "lejano", "proximo", "pronto"] as const) {
      expect(urgencyHexCalendario(estado)).toBeUndefined();
    }
  });
});

// Filtrar por persona escondía la FECHA DE ENTREGA del proyecto: los hitos nacen sin
// responsable ni asistentes a propósito —son de todos— y el filtro los descartaba por no
// coincidir con nadie. Elegir a un compañero borraba lo más importante de la pantalla.
describe("coincidePersona · el filtro por persona", () => {
  const conDuenio = { assignee: { name: "Camila" }, attendees: [] };
  const hito = { assignee: null, attendees: [] };

  it("sin filtro pasa todo", () => {
    expect(coincidePersona(conDuenio, "")).toBe(true);
    expect(coincidePersona(hito, "")).toBe(true);
  });

  it("deja pasar lo de la persona elegida y descarta lo de otra", () => {
    expect(coincidePersona(conDuenio, "Camila")).toBe(true);
    expect(coincidePersona(conDuenio, "Andrés")).toBe(false);
  });

  it("deja pasar SIEMPRE lo que no tiene dueño — los hitos son de todos", () => {
    expect(coincidePersona(hito, "Camila")).toBe(true);
    expect(coincidePersona(hito, "Andrés")).toBe(true);
  });

  it("una cita cuenta por sus asistentes, no solo por el responsable", () => {
    const cita = { assignee: null, attendees: [{ name: "Andrés" }, { name: "Camila" }] };
    expect(coincidePersona(cita, "Andrés")).toBe(true);
    expect(coincidePersona(cita, "Nadie")).toBe(false);
  });
});
