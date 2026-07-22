import { describe, it, expect } from "vitest";
import { parseTaskText } from "./task-parse";

// Instante fijo: domingo 19 de julio de 2026, 14:00 hora de Bogotá (19:00Z) — el mismo del
// suite de reminder-parse, para que las fechas relativas cuadren entre ambos parsers.
const NOW = Date.UTC(2026, 6, 19, 19, 0, 0);

describe("parseTaskText", () => {
  it("tarea completa: fecha, hora, @persona, #tag y estimación", () => {
    const p = parseTaskText("Grabar dron mañana 9am @Zahid #rodaje 2h", NOW);
    expect(p.title).toBe("Grabar dron");
    expect(p.dueYmd).toBe("2026-07-20");
    expect(p.dueTime).toBe("09:00");
    expect(p.assigneeQuery).toBe("Zahid");
    expect(p.tags).toEqual(["rodaje"]);
    expect(p.estimatedMinutes).toBe(120);
  });

  it("prioridad con ! y sin fecha", () => {
    const p = parseTaskText("Llamar al cliente !alta", NOW);
    expect(p.title).toBe("Llamar al cliente");
    expect(p.priorityQuery).toBe("alta");
    expect(p.dueYmd).toBeNull();
    expect(p.dueTime).toBeNull();
  });

  it("estimación en minutos sueltos («30m»)", () => {
    const p = parseTaskText("editar reel el viernes 30m", NOW);
    expect(p.dueYmd).toBe("2026-07-24"); // viernes siguiente al domingo 19
    expect(p.estimatedMinutes).toBe(30);
    expect(p.title).toBe("editar reel");
  });

  it("«en 30 min» es FECHA relativa, no estimación", () => {
    const p = parseTaskText("revisar guion en 30 min", NOW);
    expect(p.estimatedMinutes).toBeNull();
    expect(p.dueYmd).toBe("2026-07-19");
    expect(p.dueTime).toBe("14:30"); // 14:00 Bogotá + 30 min
    expect(p.title).toBe("revisar guion");
  });

  it("«1h30» = 90 minutos", () => {
    const p = parseTaskText("exportar masters 1h30", NOW);
    expect(p.estimatedMinutes).toBe(90);
    expect(p.title).toBe("exportar masters");
  });

  it("varias etiquetas + prioridad + hoy con hora", () => {
    const p = parseTaskText("subir corte #edicion #dove !urgente hoy 5pm", NOW);
    expect(p.tags).toEqual(["edicion", "dove"]);
    expect(p.priorityQuery).toBe("urgente");
    expect(p.dueYmd).toBe("2026-07-19");
    expect(p.dueTime).toBe("17:00");
    expect(p.title).toBe("subir corte");
  });

  it("sin tokens: texto plano queda como título, sin fecha por defecto", () => {
    const p = parseTaskText("Organizar bodega de equipos", NOW);
    expect(p.title).toBe("Organizar bodega de equipos");
    expect(p.dueYmd).toBeNull();
    expect(p.assigneeQuery).toBeNull();
    expect(p.tags).toEqual([]);
    expect(p.estimatedMinutes).toBeNull();
  });

  it("decimal con coma: «1,5h» = 90 min", () => {
    const p = parseTaskText("color y sonido 1,5h", NOW);
    expect(p.estimatedMinutes).toBe(90);
  });
});
