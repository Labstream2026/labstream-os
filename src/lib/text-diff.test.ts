import { describe, it, expect } from "vitest";
import { diffLineas, diffCompacto } from "./text-diff";

describe("diffLineas (qué cambió entre dos versiones)", () => {
  it("detecta una línea añadida", () => {
    const d = diffLineas("uno\ndos", "uno\ndos\ntres");
    expect(d.anadidas).toBe(1);
    expect(d.quitadas).toBe(0);
    expect(d.lineas.at(-1)).toEqual({ tipo: "mas", texto: "tres" });
  });

  it("detecta una línea quitada", () => {
    const d = diffLineas("uno\ndos\ntres", "uno\ntres");
    expect(d.quitadas).toBe(1);
    expect(d.anadidas).toBe(0);
    expect(d.lineas.find((l) => l.tipo === "menos")?.texto).toBe("dos");
  });

  it("una línea editada cuenta como quitada + añadida", () => {
    const d = diffLineas("hola mundo", "hola planeta");
    expect(d.anadidas).toBe(1);
    expect(d.quitadas).toBe(1);
  });

  it("dos textos idénticos no tienen cambios", () => {
    const d = diffLineas("igual\nigual", "igual\nigual");
    expect(d.anadidas + d.quitadas).toBe(0);
    expect(d.lineas.every((l) => l.tipo === "igual")).toBe(true);
  });

  it("conserva el orden del texto NUEVO al reconstruirlo", () => {
    const d = diffLineas("a\nb\nc", "a\nX\nc\nY");
    const reconstruido = d.lineas.filter((l) => l.tipo !== "menos").map((l) => l.texto).join("\n");
    expect(reconstruido).toBe("a\nX\nc\nY");
  });

  it("conserva el texto VIEJO al descartar lo añadido", () => {
    const d = diffLineas("a\nb\nc", "a\nX\nc\nY");
    const viejo = d.lineas.filter((l) => l.tipo !== "mas").map((l) => l.texto).join("\n");
    expect(viejo).toBe("a\nb\nc");
  });

  it("tolera textos vacíos", () => {
    expect(diffLineas("", "").anadidas).toBe(0);
    expect(diffLineas("", "nuevo").anadidas).toBe(1);
    expect(diffLineas("viejo", "").quitadas).toBe(1);
  });

  it("normaliza los saltos de línea de Windows", () => {
    expect(diffLineas("a\r\nb", "a\nb").anadidas + diffLineas("a\r\nb", "a\nb").quitadas).toBe(0);
  });

  it("se rinde (sin romperse) con textos enormes", () => {
    const enorme = "linea\n".repeat(2000);
    const d = diffLineas(enorme, enorme + "extra");
    expect(d.truncado).toBe(true);
    expect(d.lineas).toEqual([]);
  });
});

describe("diffCompacto (solo los tramos que cambiaron)", () => {
  it("omite el texto sin cambios que queda lejos", () => {
    const antes = Array.from({ length: 30 }, (_, i) => `linea ${i}`).join("\n");
    const despues = antes.replace("linea 15", "linea QUINCE");
    const bloques = diffCompacto(diffLineas(antes, despues), 2);
    const total = bloques.reduce((n, b) => n + b.length, 0);
    expect(bloques.length).toBeGreaterThan(0);
    expect(total).toBeLessThan(12); // no el documento entero
    expect(bloques.flat().some((l) => l.texto === "linea QUINCE")).toBe(true);
  });

  it("separa en bloques distintos dos cambios alejados", () => {
    const antes = Array.from({ length: 40 }, (_, i) => `l${i}`).join("\n");
    const despues = antes.replace("l2", "l2b").replace("l35", "l35b");
    expect(diffCompacto(diffLineas(antes, despues), 1).length).toBe(2);
  });

  it("sin cambios no devuelve bloques", () => {
    expect(diffCompacto(diffLineas("a\nb", "a\nb"))).toEqual([]);
  });

  it("con un diff truncado no devuelve bloques", () => {
    const enorme = "x\n".repeat(2000);
    expect(diffCompacto(diffLineas(enorme, enorme + "y"))).toEqual([]);
  });
});
