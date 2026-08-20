import { describe, it, expect } from "vitest";
import { taskToCalItems } from "./build-items";
import { urgencyHex } from "@/lib/task-urgency";

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

  it("no le cambia el color a la que no tiene fecha de entrega", () => {
    const [chip] = taskToCalItems({ ...base, dueDate: null, shootDate: ayer });
    // Sin dueDate no hay chip de entrega: el único que sale es el de rodaje, que no lleva color
    // de urgencia (un rodaje no vence).
    expect(chip.kind).toBe("shoot");
    expect(chip.urgencyHex).toBeUndefined();
  });
});
