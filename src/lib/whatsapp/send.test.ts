import { describe, expect, it } from "vitest";
import { toWhatsappNumber } from "./send";

describe("toWhatsappNumber", () => {
  it("añade el indicativo a un móvil colombiano escrito como lo escribe la gente", () => {
    expect(toWhatsappNumber("300 123 4567")).toBe("573001234567");
    expect(toWhatsappNumber("3001234567")).toBe("573001234567");
    expect(toWhatsappNumber("(300) 123-4567")).toBe("573001234567");
  });

  it("respeta el número que ya trae indicativo", () => {
    expect(toWhatsappNumber("+57 300 123 4567")).toBe("573001234567");
    expect(toWhatsappNumber("573001234567")).toBe("573001234567");
  });

  it("entiende el prefijo internacional 00", () => {
    expect(toWhatsappNumber("0057 300 123 4567")).toBe("573001234567");
  });

  it("deja pasar números de otros países ya completos", () => {
    expect(toWhatsappNumber("34600123456")).toBe("34600123456");
    expect(toWhatsappNumber("+1 415 555 0132")).toBe("14155550132");
  });

  it("rechaza lo que no puede ser un número", () => {
    expect(toWhatsappNumber("")).toBeNull();
    expect(toWhatsappNumber("hola")).toBeNull();
    expect(toWhatsappNumber("123")).toBeNull();
    expect(toWhatsappNumber("1234567890123456789")).toBeNull();
  });
});
