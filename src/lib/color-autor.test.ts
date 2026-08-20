import { describe, expect, it } from "vitest";
import { claveDeAutor, colorDeAutor, inicialesDeAutor } from "./color-autor";

describe("claveDeAutor", () => {
  it("normaliza mayúsculas y espacios: la misma persona escrita distinto es una sola clave", () => {
    expect(claveDeAutor("Jaime")).toBe("jaime");
    expect(claveDeAutor("  JAIME  ")).toBe("jaime");
    expect(claveDeAutor("Juan Sebastián")).toBe("juan sebastián");
  });
});

describe("colorDeAutor", () => {
  it("es determinista: mismo nombre, mismo color, siempre", () => {
    const a = colorDeAutor("Jaime");
    expect(colorDeAutor("Jaime")).toEqual(a);
    expect(colorDeAutor("jaime")).toEqual(a);
    expect(colorDeAutor(" Jaime ")).toEqual(a);
  });

  it("devuelve pares base/claro en formato hex", () => {
    const c = colorDeAutor("Juanse");
    expect(c.base).toMatch(/^#[0-9a-f]{6}$/);
    expect(c.claro).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("reparte: un grupo realista de nombres no cae todo en el mismo color", () => {
    const nombres = ["Jaime", "Juanse", "Jonathan", "Danney", "Diana", "Cliente", "María", "Andrés"];
    const distintos = new Set(nombres.map((n) => colorDeAutor(n).base));
    expect(distintos.size).toBeGreaterThan(2);
  });

  it("no explota con nombre vacío", () => {
    expect(colorDeAutor("").base).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorDeAutor("  ").base).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("nunca usa los colores con significado de la sala (verde de hecha, ámbar de pendiente)", () => {
    // emerald-400/500 y amber-400 son los de estado en marcas y chips.
    const reservados = new Set(["#34d399", "#10b981", "#fbbf24", "#f59e0b", "#f97316"]);
    for (const n of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"]) {
      const c = colorDeAutor(n);
      expect(reservados.has(c.base)).toBe(false);
      expect(reservados.has(c.claro)).toBe(false);
    }
  });
});

describe("inicialesDeAutor", () => {
  it("dos palabras → primera letra de cada una", () => {
    expect(inicialesDeAutor("Juan Sebastián")).toBe("JS");
    expect(inicialesDeAutor("Danney Gómez")).toBe("DG");
  });
  it("una palabra → sus dos primeras letras", () => {
    expect(inicialesDeAutor("Jaime")).toBe("JA");
  });
  it("vacío → interrogante (sin reventar)", () => {
    expect(inicialesDeAutor("")).toBe("?");
    expect(inicialesDeAutor("   ")).toBe("?");
  });
});
