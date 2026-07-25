import { describe, expect, it } from "vitest";
import { deliveryCountdownLabel, deliveryDaysLeft, deliveryGroupOf } from "./delivery-groups";

describe("deliveryGroupOf", () => {
  it("manda lo vertical corto a reels", () => {
    expect(deliveryGroupOf("REEL")).toBe("reels");
    expect(deliveryGroupOf("SHORT")).toBe("reels");
    expect(deliveryGroupOf("REEL_CELULAR")).toBe("reels");
    expect(deliveryGroupOf("TEASER")).toBe("reels");
  });

  it("manda lo largo a videos", () => {
    expect(deliveryGroupOf("VIDEO_LARGO")).toBe("videos");
    expect(deliveryGroupOf("PODCAST")).toBe("videos");
  });

  it("fotografía va a fotos y lo desconocido a otros", () => {
    expect(deliveryGroupOf("FOTOGRAFIA")).toBe("fotos");
    expect(deliveryGroupOf("DOCUMENTO")).toBe("otros");
    expect(deliveryGroupOf("OTRO")).toBe("otros");
    expect(deliveryGroupOf("TIPO_FUTURO")).toBe("otros");
  });
});

describe("deliveryDaysLeft", () => {
  const now = new Date("2026-07-25T12:00:00Z");

  it("sin caducidad devuelve null", () => {
    expect(deliveryDaysLeft(null, now)).toBeNull();
  });

  it("redondea hacia arriba (medio día = queda 1 día)", () => {
    expect(deliveryDaysLeft(new Date("2026-07-26T00:00:00Z"), now)).toBe(1);
    expect(deliveryDaysLeft(new Date("2026-08-24T12:00:00Z"), now)).toBe(30);
  });

  it("ya vencido o justo ahora devuelve 0", () => {
    expect(deliveryDaysLeft(new Date("2026-07-25T12:00:00Z"), now)).toBe(0);
    expect(deliveryDaysLeft(new Date("2026-07-20T00:00:00Z"), now)).toBe(0);
  });
});

describe("deliveryCountdownLabel", () => {
  it("frasea singular, plural y hoy", () => {
    expect(deliveryCountdownLabel(null)).toBeNull();
    expect(deliveryCountdownLabel(0)).toBe("expira hoy");
    expect(deliveryCountdownLabel(1)).toBe("queda 1 día");
    expect(deliveryCountdownLabel(30)).toBe("quedan 30 días");
  });
});
