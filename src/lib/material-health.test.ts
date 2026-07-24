import { describe, expect, it } from "vitest";
import { daysSince, materialHealth } from "./material-health";

type L = Parameters<typeof materialHealth>[0][number];
const loc = (over: Partial<L>): L => ({ role: "BRUTO", diskId: "d1", diskKind: "HDD", offsite: false, ...over });

describe("materialHealth (regla 3-2-1)", () => {
  it("sin ubicaciones → SIN_REGISTRO", () => {
    expect(materialHealth([]).level).toBe("SIN_REGISTRO");
  });

  it("solo EDICION/EXPORTES no cuentan como copia", () => {
    const h = materialHealth([loc({ role: "EDICION" }), loc({ role: "EXPORTES", diskId: "d2" })]);
    expect(h.level).toBe("SIN_REGISTRO");
    expect(h.copies).toBe(0);
  });

  it("una sola copia → SIN_RESPALDO", () => {
    const h = materialHealth([loc({})]);
    expect(h.level).toBe("SIN_RESPALDO");
    expect(h.label).toBe("Sin respaldo");
  });

  it("bruto y respaldo en el MISMO disco siguen siendo una copia", () => {
    const h = materialHealth([loc({}), loc({ role: "RESPALDO" })]);
    expect(h.copies).toBe(1);
    expect(h.level).toBe("SIN_RESPALDO");
  });

  it("dos copias → PARCIAL con etiqueta «2 copias»", () => {
    const h = materialHealth([loc({}), loc({ role: "RESPALDO", diskId: "d2" })]);
    expect(h.level).toBe("PARCIAL");
    expect(h.label).toBe("2 copias");
  });

  it("tres copias en un solo soporte no pasan (falta el segundo medio)", () => {
    const h = materialHealth([
      loc({}),
      loc({ role: "RESPALDO", diskId: "d2" }),
      loc({ role: "RESPALDO", diskId: "d3", offsite: true }),
    ]);
    expect(h.media).toBe(1);
    expect(h.level).toBe("PARCIAL");
  });

  it("tres copias, dos medios, ninguna fuera → PARCIAL", () => {
    const h = materialHealth([
      loc({}),
      loc({ role: "RESPALDO", diskId: "d2", diskKind: "NAS" }),
      loc({ role: "RESPALDO", diskId: "d3" }),
    ]);
    expect(h.offsite).toBe(0);
    expect(h.level).toBe("PARCIAL");
  });

  it("3 copias + 2 medios + 1 fuera → OK", () => {
    const h = materialHealth([
      loc({}),
      loc({ role: "RESPALDO", diskId: "d2", diskKind: "NAS" }),
      loc({ role: "RESPALDO", diskId: "d3", offsite: true }),
    ]);
    expect(h.level).toBe("OK");
    expect(h.label).toBe("3-2-1 ✓");
  });

  it("la NUBE cuenta como fuera del estudio sin marcar offsite", () => {
    const h = materialHealth([
      loc({}),
      loc({ role: "RESPALDO", diskId: "d2", diskKind: "NAS" }),
      loc({ role: "RESPALDO", diskId: "d3", diskKind: "NUBE" }),
    ]);
    expect(h.offsite).toBe(1);
    expect(h.level).toBe("OK");
  });

  it("EDICION no suma copia aunque esté en otro disco", () => {
    const h = materialHealth([loc({}), loc({ role: "EDICION", diskId: "d9" })]);
    expect(h.copies).toBe(1);
  });
});

describe("daysSince", () => {
  const now = new Date("2026-07-24T12:00:00Z");
  it("null → null", () => {
    expect(daysSince(null, now)).toBeNull();
  });
  it("cuenta días enteros", () => {
    expect(daysSince(new Date("2026-07-20T12:00:00Z"), now)).toBe(4);
    expect(daysSince(new Date("2026-07-24T01:00:00Z"), now)).toBe(0);
  });
});
