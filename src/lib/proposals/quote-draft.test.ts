import { describe, it, expect } from "vitest";
import { quoteDraftFromBlocks } from "./quote-draft";

// Lo que se prueba aquí es DINERO: que lo que viaja de la propuesta a la cotización sea
// exactamente lo que el cliente aceptó, ni un peso más ni uno menos.

const budget = (over: Record<string, unknown> = {}) => ({
  type: "budget",
  title: "Cotización.",
  cur: "COP",
  iva: 19,
  price: 5_000_000,
  discountPct: 0,
  sections: [
    { s: "Preproducción", items: [{ t: "Reunión de alineación", q: 1, v: 200_000 }] },
    { s: "Producción", items: [{ t: "Jornada de rodaje", q: 1, v: 600_000 }, { t: "Dron", q: 1, v: 200_000 }] },
  ],
  ...over,
});

describe("quoteDraftFromBlocks · bloque Desglose", () => {
  it("las líneas suman EXACTAMENTE el precio aceptado, no el costo interno", () => {
    const d = quoteDraftFromBlocks([budget()])!;
    expect(d.subtotal).toBe(5_000_000);
    expect(d.lines.reduce((a, l) => a + l.unitPrice, 0)).toBe(5_000_000);
    // El costo interno (1.000.000) solo repartió la proporción; nunca es el valor cotizado.
    expect(d.lines.some((l) => l.unitPrice === 200_000)).toBe(false);
  });

  it("reparte proporcional al costo interno y conserva las secciones", () => {
    const d = quoteDraftFromBlocks([budget()])!;
    // Pesos 200k/600k/200k sobre 1M → 20% / 60% / 20% de 5M.
    expect(d.lines.map((l) => l.unitPrice)).toEqual([1_000_000, 3_000_000, 1_000_000]);
    expect(d.lines.map((l) => l.section)).toEqual(["Preproducción", "Producción", "Producción"]);
    expect(d.lines[1].description).toBe("Jornada de rodaje");
  });

  it("aplica el descuento: viaja lo que el cliente REALMENTE aceptó", () => {
    const d = quoteDraftFromBlocks([budget({ discountPct: 10 })])!;
    expect(d.subtotal).toBe(4_500_000);
    expect(d.lines.reduce((a, l) => a + l.unitPrice, 0)).toBe(4_500_000);
  });

  it("el redondeo no pierde ni inventa pesos", () => {
    // 1.000.001 entre tres pesos iguales no reparte exacto: la diferencia va a la última línea.
    const d = quoteDraftFromBlocks([
      budget({
        price: 1_000_001,
        sections: [{ s: "A", items: [{ t: "x", q: 1, v: 1 }, { t: "y", q: 1, v: 1 }, { t: "z", q: 1, v: 1 }] }],
      }),
    ])!;
    expect(d.lines.reduce((a, l) => a + l.unitPrice, 0)).toBe(1_000_001);
  });

  it("toma el IVA y la moneda del bloque", () => {
    const d = quoteDraftFromBlocks([budget({ iva: 0, cur: "USD" })])!;
    expect(d.taxRate).toBe(0);
    expect(d.currency).toBe("USD");
  });

  it("ignora los conceptos desactivados en el constructor", () => {
    const d = quoteDraftFromBlocks([
      budget({ sections: [{ s: "A", items: [{ t: "sí", q: 1, v: 100 }, { t: "no", q: 1, v: 100, on: false }] }] }),
    ])!;
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].description).toBe("sí");
    expect(d.lines[0].unitPrice).toBe(5_000_000);
  });

  it("sin desglose utilizable deja UNA línea por el precio acordado", () => {
    const d = quoteDraftFromBlocks([budget({ sections: [] })])!;
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0].unitPrice).toBe(5_000_000);
  });

  it("la cantidad pesa: tres días valen el triple que un concepto suelto", () => {
    const d = quoteDraftFromBlocks([
      budget({ price: 4_000_000, sections: [{ s: "A", items: [{ t: "días", q: 3, v: 100 }, { t: "otro", q: 1, v: 100 }] }] }),
    ])!;
    expect(d.lines.map((l) => l.unitPrice)).toEqual([3_000_000, 1_000_000]);
  });
});

describe("quoteDraftFromBlocks · bloque Inversión y casos vacíos", () => {
  it("lee los precios escritos en formato colombiano", () => {
    const d = quoteDraftFromBlocks([
      { type: "pricing", rows: [{ c: "Preproducción", p: "$400.000" }, { c: "Rodaje", p: "$2.400.000" }, { c: "Extra", p: "A convenir" }] },
    ])!;
    expect(d.lines).toHaveLength(2); // «A convenir» no es un valor
    expect(d.subtotal).toBe(2_800_000);
  });

  it("sin bloque de dinero devuelve null (no hay nada que cotizar)", () => {
    expect(quoteDraftFromBlocks([{ type: "hero", title: "x" }])).toBeNull();
    expect(quoteDraftFromBlocks([])).toBeNull();
    expect(quoteDraftFromBlocks(null)).toBeNull();
  });

  it("un desglose sin precio al cliente no se cotiza a medias", () => {
    expect(quoteDraftFromBlocks([budget({ price: 0 })])).toBeNull();
  });

  it("con dos bloques de dinero manda el último (el que quedó vigente)", () => {
    const d = quoteDraftFromBlocks([budget({ price: 1_000_000 }), budget({ price: 7_000_000 })])!;
    expect(d.subtotal).toBe(7_000_000);
  });
});
