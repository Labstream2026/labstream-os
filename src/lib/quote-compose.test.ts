import { describe, it, expect } from "vitest";
import { clientLineValue, composeQuoteTotals, unitLabel } from "./quote-compose";

describe("clientLineValue (valor que ve el cliente: costo ajustado por imprevisto)", () => {
  it("aplica el imprevisto sobre cantidad × precio", () => {
    expect(clientLineValue({ quantity: 1, unitPrice: 1_000_000 }, 10)).toBe(1_100_000);
    expect(clientLineValue({ quantity: 2, unitPrice: 450_000 }, 10)).toBe(990_000);
  });
  it("sin imprevisto, el valor del cliente = costo", () => {
    expect(clientLineValue({ quantity: 3, unitPrice: 250_000 }, 0)).toBe(750_000);
    expect(clientLineValue({ quantity: 3, unitPrice: 250_000 })).toBe(750_000);
  });
  it("imprevisto negativo se trata como 0 (no descuenta)", () => {
    expect(clientLineValue({ quantity: 1, unitPrice: 500_000 }, -25)).toBe(500_000);
  });
  it("redondea a peso entero", () => {
    // 333333 × 1.1 = 366666.3 → 366666
    expect(clientLineValue({ quantity: 1, unitPrice: 333_333 }, 10)).toBe(366_666);
    // 333334 × 1.1 = 366667.4 → 366667
    expect(clientLineValue({ quantity: 1, unitPrice: 333_334 }, 10)).toBe(366_667);
  });
});

describe("composeQuoteTotals (totales con imprevisto oculto + IVA)", () => {
  it("desglosa costo, imprevisto, subtotal cliente, IVA y total", () => {
    const t = composeQuoteTotals(
      [{ quantity: 1, unitPrice: 1_000_000 }, { quantity: 2, unitPrice: 450_000 }],
      { taxRate: 19, contingencyPct: 10 },
    );
    expect(t.costSubtotal).toBe(1_900_000); // 1.000.000 + 900.000
    expect(t.clientSubtotal).toBe(2_090_000); // 1.100.000 + 990.000
    expect(t.contingency).toBe(190_000); // cliente − costo
    expect(t.tax).toBe(397_100); // 19% de 2.090.000
    expect(t.total).toBe(2_487_100); // subtotal cliente + IVA
  });

  it("el subtotal del cliente = suma de valores por línea (redondeo POR LÍNEA, no al final)", () => {
    // 3 líneas que suman 1.000.000 de costo; al 10% por línea da 1.099.999, no 1.100.000.
    const t = composeQuoteTotals(
      [{ quantity: 1, unitPrice: 333_333 }, { quantity: 1, unitPrice: 333_333 }, { quantity: 1, unitPrice: 333_334 }],
      { contingencyPct: 10 },
    );
    expect(t.clientSubtotal).toBe(1_099_999);
    expect(t.clientSubtotal).not.toBe(Math.round(1_000_000 * 1.1)); // 1.100.000
    // Invariante: el cliente nunca ve el imprevisto como línea; los valores discriminados suman al subtotal.
    expect(t.costSubtotal + t.contingency).toBe(t.clientSubtotal);
  });

  it("sin IVA ni imprevisto: total = costo", () => {
    const t = composeQuoteTotals([{ quantity: 2, unitPrice: 500_000 }]);
    expect(t.costSubtotal).toBe(1_000_000);
    expect(t.clientSubtotal).toBe(1_000_000);
    expect(t.contingency).toBe(0);
    expect(t.tax).toBe(0);
    expect(t.total).toBe(1_000_000);
  });

  it("sin líneas, todo en cero", () => {
    const t = composeQuoteTotals([], { taxRate: 19, contingencyPct: 10 });
    expect(t).toEqual({ costSubtotal: 0, contingency: 0, clientSubtotal: 0, tax: 0, total: 0 });
  });

  it("tasas negativas se tratan como 0", () => {
    const t = composeQuoteTotals([{ quantity: 1, unitPrice: 100_000 }], { taxRate: -5, contingencyPct: -5 });
    expect(t.tax).toBe(0);
    expect(t.contingency).toBe(0);
    expect(t.total).toBe(100_000);
  });
});

describe("unitLabel (singular/plural de la unidad de cobro)", () => {
  it("singular con cantidad 1, plural con más", () => {
    expect(unitLabel("día", 1)).toBe("día");
    expect(unitLabel("día", 3)).toBe("días");
    expect(unitLabel("hora", 2)).toBe("horas");
  });
  it("sin unidad devuelve cadena vacía", () => {
    expect(unitLabel(null)).toBe("");
    expect(unitLabel(undefined)).toBe("");
  });
  it("unidades compuestas se muestran tal cual", () => {
    expect(unitLabel("unidad/día", 2)).toBe("unidad/día");
  });
});
