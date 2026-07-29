import { describe, expect, it } from "vitest";
import { daysSince, expiryTone, materialHealth } from "./material-health";

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

describe("expiryTone", () => {
  // Fechas locales (no UTC): la caducidad es un día del calendario, no un instante.
  const hoy = new Date(2026, 6, 24, 15, 0, 0);
  const enDias = (n: number) => new Date(2026, 6, 24 + n, 9, 0, 0);

  it("sin fecha no es una alerta, es la ausencia de dato", () => {
    const e = expiryTone(null, hoy);
    expect(e.level).toBe("NINGUNA");
    expect(e.days).toBeNull();
  });

  it("lo ya vencido se marca como vencido", () => {
    expect(expiryTone(enDias(-1), hoy)).toMatchObject({ level: "VENCIDO", days: -1, label: "Venció ayer" });
    expect(expiryTone(enDias(-10), hoy)).toMatchObject({ level: "VENCIDO", days: -10, label: "Venció hace 10 días" });
  });

  it("el mismo día cuenta como 0, no como vencido", () => {
    // La hora no debe influir: caduca a las 09:00 y «ahora» son las 15:00 del mismo día.
    expect(expiryTone(enDias(0), hoy)).toMatchObject({ level: "PRONTO", days: 0, label: "Vence hoy" });
  });

  it("singular y plural del día", () => {
    expect(expiryTone(enDias(1), hoy).label).toBe("Vence en 1 día");
    expect(expiryTone(enDias(2), hoy).label).toBe("Vence en 2 días");
  });

  it("el límite de 30 días cae dentro de PRONTO y el 31 ya no", () => {
    expect(expiryTone(enDias(30), hoy).level).toBe("PRONTO");
    expect(expiryTone(enDias(31), hoy).level).toBe("MEDIO");
  });

  it("el límite de 90 días cae dentro de MEDIO y el 91 ya es OK", () => {
    expect(expiryTone(enDias(90), hoy).level).toBe("MEDIO");
    expect(expiryTone(enDias(91), hoy).level).toBe("OK");
  });

  it("entre 31 y 90 días se cuenta en meses", () => {
    expect(expiryTone(enDias(60), hoy).label).toBe("~2 meses");
    // Nunca «~0 meses»: 31 días redondearía a 1 igualmente, pero el suelo lo garantiza.
    expect(expiryTone(enDias(31), hoy).label).toBe("~1 mes");
  });
});
