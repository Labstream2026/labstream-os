import { describe, expect, it } from "vitest";
import { dineroCorto, parsePeriodo } from "./datos";

// Lo delicado de Reportes v2 es la aritmética de PERIODOS en UTC (bordes de mes, rangos
// anteriores para los deltas) y el dinero corto de los KPIs. Se prueba con un "ahora" fijo.

const AHORA = new Date(Date.UTC(2026, 7, 13, 14, 30)); // 13 ago 2026

describe("parsePeriodo", () => {
  it("mes por defecto: el mes en curso, comparado con el anterior", () => {
    const p = parsePeriodo({}, AHORA);
    expect(p.key).toBe("mes");
    expect(p.desde?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(p.hasta.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(p.prevDesde?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(p.prevHasta?.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(p.mes).toBe("2026-08");
    expect(p.mesAnterior).toBe("2026-07");
    // El mes en curso no tiene "siguiente": la flecha ▸ se apaga.
    expect(p.mesSiguiente).toBeNull();
    expect(p.etiqueta).toBe("Ago 2026");
  });

  it("m=YYYY-MM navega a un mes pasado y habilita el siguiente", () => {
    const p = parsePeriodo({ p: "mes", m: "2026-05" }, AHORA);
    expect(p.desde?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(p.hasta.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(p.mesSiguiente).toBe("2026-06");
    expect(p.mesAnterior).toBe("2026-04");
  });

  it("el salto de año hacia atrás cuadra (enero → diciembre anterior)", () => {
    const p = parsePeriodo({ p: "mes", m: "2026-01" }, AHORA);
    expect(p.prevDesde?.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(p.mesAnterior).toBe("2025-12");
  });

  it("un mes FUTURO o basura cae al mes en curso", () => {
    expect(parsePeriodo({ p: "mes", m: "2027-01" }, AHORA).mes).toBe("2026-08");
    expect(parsePeriodo({ p: "mes", m: "no-es-mes" }, AHORA).mes).toBe("2026-08");
  });

  it("90 días: rango pegado a hoy y el bloque anterior justo detrás", () => {
    const p = parsePeriodo({ p: "90" }, AHORA);
    expect(p.hasta.getTime()).toBe(AHORA.getTime());
    expect(p.desde!.getTime()).toBe(AHORA.getTime() - 90 * 86_400_000);
    expect(p.prevHasta!.getTime()).toBe(p.desde!.getTime());
    expect(p.mes).toBeNull();
  });

  it("año: desde el 1.º de enero, comparado con el año anterior completo", () => {
    const p = parsePeriodo({ p: "ano" }, AHORA);
    expect(p.desde?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(p.prevDesde?.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(p.prevHasta?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("todo: sin límite inferior y sin deltas", () => {
    const p = parsePeriodo({ p: "todo" }, AHORA);
    expect(p.desde).toBeNull();
    expect(p.prevDesde).toBeNull();
    expect(p.etiqueta).toBe("Todo");
  });
});

describe("dineroCorto", () => {
  it("millones con una decimal (coma), sin ,0 redundante", () => {
    expect(dineroCorto(18_400_000)).toBe("$18,4 M");
    expect(dineroCorto(28_000_000)).toBe("$28 M");
  });
  it("miles y unidades", () => {
    expect(dineroCorto(980_000)).toBe("$980 mil");
    expect(dineroCorto(900)).toBe("$900");
    expect(dineroCorto(0)).toBe("$0");
  });
  it("otra divisa se antepone como código", () => {
    expect(dineroCorto(2_500_000, "EUR")).toBe("EUR 2,5 M");
  });
});
