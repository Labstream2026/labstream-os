import { describe, expect, it } from "vitest";
import { agrupar } from "./datos";

// Postgres devuelve el día LOCAL de Bogotá como fecha pura: sus componentes UTC ya son el día
// que se quiere pintar. Estas pruebas fijan que el agrupado no vuelva a meter la zona horaria
// por la puerta de atrás y que cada periodo se vea con la barra que le corresponde.

const dia = (iso: string, seg: number) => ({ dia: new Date(`${iso}T00:00:00.000Z`), seg });

describe("agrupar", () => {
  it("el mes se ve por día, con el número del día", () => {
    const r = agrupar([dia("2026-08-03", 3600), dia("2026-08-04", 7200)], { key: "mes" });
    expect(r.contexto).toBe("Por día");
    expect(r.serie.labels).toEqual(["3", "4"]);
    expect(r.serie.valores).toEqual([1, 2]);
  });

  it("90 días se ven por semana y la semana arranca el lunes", () => {
    // 2026-08-05 es miércoles y 2026-08-07 viernes: caen en la MISMA semana (lunes 3 de ago).
    const r = agrupar([dia("2026-08-05", 3600), dia("2026-08-07", 1800), dia("2026-08-10", 3600)], { key: "90" });
    expect(r.contexto).toBe("Por semana");
    expect(r.serie.labels).toEqual(["3 ago", "10 ago"]);
    expect(r.serie.valores).toEqual([1.5, 1]);
  });

  it("el lunes se queda en su propia semana, no se va a la anterior", () => {
    const r = agrupar([dia("2026-08-03", 3600)], { key: "90" });
    expect(r.serie.labels).toEqual(["3 ago"]);
  });

  it("el domingo cierra la semana del lunes anterior", () => {
    // 2026-08-09 es domingo: pertenece a la semana del lunes 3, no a la del 10.
    const r = agrupar([dia("2026-08-09", 3600)], { key: "90" });
    expect(r.serie.labels).toEqual(["3 ago"]);
  });

  it("el año se ve por mes y suma los días de cada uno", () => {
    const r = agrupar([dia("2026-07-31", 3600), dia("2026-08-01", 3600), dia("2026-08-15", 1800)], { key: "ano" });
    expect(r.contexto).toBe("Por mes");
    expect(r.serie.labels).toEqual(["jul", "ago"]);
    expect(r.serie.valores).toEqual([1, 1.5]);
  });

  it("ordena por fecha aunque las filas lleguen desordenadas", () => {
    const r = agrupar([dia("2026-08-20", 3600), dia("2026-08-02", 3600)], { key: "mes" });
    expect(r.serie.labels).toEqual(["2", "20"]);
  });

  it("cruza el fin de año sin mezclar meses de años distintos", () => {
    const r = agrupar([dia("2025-12-15", 3600), dia("2026-12-15", 7200)], { key: "todo" });
    expect(r.serie.labels).toEqual(["dic", "dic"]);
    expect(r.serie.valores).toEqual([1, 2]);
  });

  it("sin filas devuelve una serie vacía, no una con ceros", () => {
    const r = agrupar([], { key: "mes" });
    expect(r.serie.labels).toEqual([]);
    expect(r.serie.valores).toEqual([]);
  });

  it("redondea a un decimal para que la barra no arrastre ruido", () => {
    const r = agrupar([dia("2026-08-03", 3670)], { key: "mes" });
    expect(r.serie.valores).toEqual([1]);
  });
});
