import { describe, expect, it } from "vitest";
import { presetsProgramacion, validarProgramacion } from "./programar";

// Instantes fijos en UTC; Bogotá es UTC-5 sin cambios de hora.
const mar10am = Date.UTC(2026, 7, 18, 15, 0); // martes 18 ago 2026, 10:00 en Bogotá
const mar3pm = Date.UTC(2026, 7, 18, 20, 0); // martes 18 ago 2026, 15:00 en Bogotá
const lun9am = Date.UTC(2026, 7, 17, 14, 0); // lunes 17 ago 2026, 9:00 en Bogotá

describe("presetsProgramacion", () => {
  it("en la mañana ofrece la tarde de hoy, mañana y el lunes", () => {
    const p = presetsProgramacion(mar10am);
    expect(p.map((x) => x.valor)).toEqual(["2026-08-18T14:00", "2026-08-19T08:00", "2026-08-24T08:00"]);
  });

  it("pasada la 1 p. m. ya no ofrece «hoy en la tarde»", () => {
    const p = presetsProgramacion(mar3pm);
    expect(p.map((x) => x.valor)).toEqual(["2026-08-19T08:00", "2026-08-24T08:00"]);
  });

  it("un lunes, «el lunes» es el de la semana ENTRANTE, no hoy", () => {
    const p = presetsProgramacion(lun9am);
    expect(p.at(-1)?.valor).toBe("2026-08-24T08:00");
  });
});

describe("validarProgramacion", () => {
  it("convierte la pared de Bogotá al instante correcto (UTC-5 fijo)", () => {
    const d = validarProgramacion("2026-08-19T08:00", mar10am);
    expect(d?.toISOString()).toBe("2026-08-19T13:00:00.000Z");
  });

  it("rechaza lo pasado y lo que sale en menos de un minuto", () => {
    expect(validarProgramacion("2026-08-18T09:59", mar10am)).toBeNull();
    expect(validarProgramacion("2026-08-18T10:00", mar10am)).toBeNull();
  });

  it("rechaza más de un año adelante, formatos rotos y fechas imposibles", () => {
    expect(validarProgramacion("2027-09-01T08:00", mar10am)).toBeNull();
    expect(validarProgramacion("mañana a las 8", mar10am)).toBeNull();
    expect(validarProgramacion("2026-02-30T08:00", mar10am)).toBeNull();
    expect(validarProgramacion("", mar10am)).toBeNull();
  });

  it("acepta un envío a dos horas", () => {
    expect(validarProgramacion("2026-08-18T12:00", mar10am)?.toISOString()).toBe("2026-08-18T17:00:00.000Z");
  });
});
