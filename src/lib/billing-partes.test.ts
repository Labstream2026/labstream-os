import { describe, expect, it } from "vitest";
import { advanceBillTotal, saldoBillTotal, quoteBillTotal, clampAdvancePct } from "./billing";

// Cobro por hitos: la garantía que NO se puede romper es que anticipo + saldo = contrato,
// al peso, sin importar redondeos. El IVA se calcula por factura (cada una sobre su base),
// así que la suma de los IVA puede diferir del IVA de la factura única en máximo $1 — eso
// es inherente a partir el cobro en dos documentos, no un bug.

const q = (over: Partial<Parameters<typeof advanceBillTotal>[0]> = {}) => ({
  items: [{ quantity: 1, unitPrice: 1_000_000 }],
  taxRate: 19,
  contingencyPct: 0,
  advancePct: 50,
  ...over,
});

describe("clampAdvancePct", () => {
  it("null → 50 (la norma del sector)", () => {
    expect(clampAdvancePct(null)).toBe(50);
    expect(clampAdvancePct(undefined)).toBe(50);
  });
  it("acota a 1–90", () => {
    expect(clampAdvancePct(95)).toBe(90);
    expect(clampAdvancePct(100)).toBe(90);
    expect(clampAdvancePct(-5)).toBe(1);
    expect(clampAdvancePct(30)).toBe(30);
  });
});

describe("anticipo + saldo", () => {
  it("50/50 parejo: cada parte es la mitad exacta con su IVA", () => {
    const c = q();
    // subtotal 1.000.000 → anticipo 500.000 + IVA 95.000 = 595.000
    expect(advanceBillTotal(c)).toBe(595_000);
    expect(saldoBillTotal(c)).toBe(595_000);
    expect(quoteBillTotal(c)).toBe(1_190_000);
  });

  it("las BASES suman el subtotal al peso aunque el % no divida parejo", () => {
    // subtotal impar: 1.000.001 al 50% → anticipo redondea a 500.001, saldo 500.000
    const c = q({ items: [{ quantity: 1, unitPrice: 1_000_001 }], taxRate: 0 });
    const anticipo = advanceBillTotal(c);
    const saldo = saldoBillTotal(c);
    expect(anticipo).toBe(500_001);
    expect(saldo).toBe(500_000);
    expect(anticipo + saldo).toBe(quoteBillTotal(c)); // sin IVA la suma es EXACTA
  });

  it("con IVA, la suma de partes difiere del total único en máximo $1 (redondeo por factura)", () => {
    for (const pct of [30, 50, 60, 90]) {
      for (const price of [999_999, 1_000_001, 1_234_567, 777_773]) {
        const c = q({ items: [{ quantity: 1, unitPrice: price }], advancePct: pct });
        const juntas = advanceBillTotal(c) + saldoBillTotal(c);
        expect(Math.abs(juntas - quoteBillTotal(c))).toBeLessThanOrEqual(1);
      }
    }
  });

  it("el imprevisto ya viene incluido en las bases (misma composición que la factura completa)", () => {
    // costo 1.000.000 + 10% imprevisto → subtotal cliente 1.100.000; anticipo 40% = 440.000
    const c = q({ contingencyPct: 10, advancePct: 40, taxRate: 0 });
    expect(advanceBillTotal(c)).toBe(440_000);
    expect(saldoBillTotal(c)).toBe(660_000);
  });

  it("varias líneas: el imprevisto se aplica POR LÍNEA (igual que clientLineValue)", () => {
    // Tres líneas con valores que redondean distinto por línea que en bloque.
    const c = q({
      items: [
        { quantity: 2, unitPrice: 333_333 },
        { quantity: 1, unitPrice: 250_005 },
        { quantity: 3, unitPrice: 99_999 },
      ],
      contingencyPct: 7.5,
      advancePct: 50,
      taxRate: 19,
    });
    // No importa el número exacto: importa que anticipo+saldo (sin IVA cada uno) sea
    // consistente — verificamos vía taxRate 0 que las bases complementan al peso.
    const sinIva = { ...c, taxRate: 0 };
    expect(advanceBillTotal(sinIva) + saldoBillTotal(sinIva)).toBe(quoteBillTotal(sinIva));
  });

  it("sin advancePct usa el default 50 (mismo clamp que la emisión)", () => {
    const c = q({ advancePct: null, taxRate: 0 });
    expect(advanceBillTotal(c)).toBe(500_000);
  });
});
