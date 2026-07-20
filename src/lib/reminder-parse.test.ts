import { describe, it, expect } from "vitest";
import { parseReminderText } from "./reminder-parse";

// Instante fijo: domingo 19 de julio de 2026, 14:00 hora de Bogotá (19:00Z).
const NOW = Date.UTC(2026, 6, 19, 19, 0, 0);

describe("parseReminderText", () => {
  it("«el 30 a las 9» → día del mes + hora", () => {
    const p = parseReminderText("Pagar nómina el 30 a las 9", NOW);
    expect(p.title).toBe("Pagar nómina");
    expect(p.frequency).toBe("UNA_VEZ");
    expect(p.alerts).toEqual([{ date: "2026-07-30", time: "09:00" }]);
    expect(p.matched).toBe(true);
  });

  it("«cada día 3pm» → diario a las 15:00", () => {
    const p = parseReminderText("Estiramiento cada día 3pm", NOW);
    expect(p.title).toBe("Estiramiento");
    expect(p.frequency).toBe("DIARIO");
    expect(p.timeOfDay).toBe("15:00");
  });

  it("«cada semana lunes 9:00» → semanal el lunes", () => {
    const p = parseReminderText("Reunión equipo cada semana lunes 9:00", NOW);
    expect(p.title).toBe("Reunión equipo");
    expect(p.frequency).toBe("SEMANAL");
    expect(p.weekdays).toEqual([1]);
    expect(p.timeOfDay).toBe("09:00");
  });

  it("«los lunes y viernes a las 7» → semanal multi-día", () => {
    const p = parseReminderText("Backup los lunes y viernes a las 7", NOW);
    expect(p.title).toBe("Backup");
    expect(p.frequency).toBe("SEMANAL");
    expect(p.weekdays.slice().sort()).toEqual([1, 5]);
    expect(p.timeOfDay).toBe("07:00");
  });

  it("«mañana 7am» → una vez mañana a las 07:00", () => {
    const p = parseReminderText("Grabación mañana 7am", NOW);
    expect(p.title).toBe("Grabación");
    expect(p.alerts).toEqual([{ date: "2026-07-20", time: "07:00" }]);
  });

  it("«el viernes» sin hora → próximo viernes 08:00 (hora por defecto)", () => {
    const p = parseReminderText("Enviar informe el viernes", NOW);
    expect(p.title).toBe("Enviar informe");
    expect(p.alerts).toEqual([{ date: "2026-07-24", time: "08:00" }]);
    const timeChip = p.chips.find((c) => c.kind === "time");
    expect(timeChip?.fallback).toBe(true);
  });

  it("«en 30 min» → relativo desde ahora", () => {
    const p = parseReminderText("llamar al cliente en 30 min", NOW);
    expect(p.title).toBe("llamar al cliente");
    expect(p.alerts).toEqual([{ date: "2026-07-19", time: "14:30" }]);
  });

  it("«cada mes el 1 a las 8am» → mensual día 1", () => {
    const p = parseReminderText("Pagar arriendo cada mes el 1 a las 8am", NOW);
    expect(p.title).toBe("Pagar arriendo");
    expect(p.frequency).toBe("MENSUAL");
    expect(p.dayOfMonth).toBe(1);
    expect(p.timeOfDay).toBe("08:00");
  });

  it("«el 5 de agosto a las 10» → fecha con mes", () => {
    const p = parseReminderText("Cita el 5 de agosto a las 10", NOW);
    expect(p.title).toBe("Cita");
    expect(p.alerts).toEqual([{ date: "2026-08-05", time: "10:00" }]);
  });

  it("«hoy a las 8 de la noche» → hoy 20:00", () => {
    const p = parseReminderText("Cierre hoy a las 8 de la noche", NOW);
    expect(p.title).toBe("Cierre");
    expect(p.alerts).toEqual([{ date: "2026-07-19", time: "20:00" }]);
  });

  it("sin nada temporal → no marca y usa mañana 08:00 por defecto", () => {
    const p = parseReminderText("Comprar 2 amplificadores", NOW);
    expect(p.matched).toBe(false);
    expect(p.title).toBe("Comprar 2 amplificadores");
    expect(p.alerts).toEqual([{ date: "2026-07-20", time: "08:00" }]);
    expect(p.chips.every((c) => c.fallback)).toBe(true);
  });

  it("«solo hora futura» → hoy; «hora ya pasada» → mañana", () => {
    const p1 = parseReminderText("Llamar a las 6 de la tarde", NOW); // 18:00 > 14:00
    expect(p1.alerts).toEqual([{ date: "2026-07-19", time: "18:00" }]);
    const p2 = parseReminderText("Llamar a las 9", NOW); // 09:00 ya pasó
    expect(p2.alerts).toEqual([{ date: "2026-07-20", time: "09:00" }]);
  });
});
