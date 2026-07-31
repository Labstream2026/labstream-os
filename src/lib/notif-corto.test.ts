import { describe, expect, it } from "vitest";
import { corto } from "@/components/layout/notifications-bell";

// El acortador de la campana. Se prueba porque es de las funciones que estropean texto EN
// SILENCIO: si un día se pasa de lista y se come media frase, nadie ve un error — solo avisos
// que no se entienden. Y porque el original completo debe seguir estando siempre (va en el
// `title` del elemento), así que acortar nunca puede ser perder.

describe("acortar el texto de un aviso", () => {
  it("quita el paréntesis del final, que es donde vive el detalle prescindible", () => {
    expect(corto("Zahid liberó la v1 de «Prime 2026» directo al cliente (revisión directa)")).toBe(
      "Zahid liberó la v1 de «Prime 2026» directo al cliente",
    );
  });

  it("se come también la ruta entera del archivo", () => {
    const largo = "Zahid añadió la v1 de «Prime 2026 Ingles V2» desde el disco (Camilo Ortega/VSL/Primer Performan/Prime 2026 Ingles V2.mp4)";
    expect(corto(largo)).toBe("Zahid añadió la v1 de «Prime 2026 Ingles V2» desde el disco");
  });

  it("deja intacto lo que ya es corto", () => {
    expect(corto("Camila pidió cambios en Reel Enero")).toBe("Camila pidió cambios en Reel Enero");
  });

  it("solo quita el paréntesis FINAL, no los del medio", () => {
    // «(v2)» en mitad de la frase es parte de lo que se cuenta, no una coletilla.
    expect(corto("Ana subió el corte (v2) y avisó al cliente")).toBe("Ana subió el corte (v2) y avisó al cliente");
  });

  it("no deja el texto vacío si el aviso ENTERO era un paréntesis", () => {
    // Sin esta guarda, un aviso así desaparecería de la pantalla sin dejar rastro.
    expect(corto("(sin descripción)")).toBe("(sin descripción)");
  });

  it("corta por espacio, no a mitad de palabra, y avisa con puntos suspensivos", () => {
    const r = corto("Zahid Delghans terminó de revisar el material completo de la campaña de septiembre", 40);
    expect(r.endsWith("…")).toBe(true);
    expect(r.length).toBeLessThanOrEqual(41);
    // Lo que queda antes de los puntos son palabras enteras.
    expect(r.slice(0, -1).trimEnd().split(" ").pop()).not.toBe("");
    expect("Zahid Delghans terminó de revisar el material completo de la campaña de septiembre").toContain(r.slice(0, -1).trimEnd());
  });

  it("con una palabra larguísima y sin espacios, corta igual en vez de rendirse", () => {
    const r = corto("A".repeat(200), 30);
    expect(r).toBe("A".repeat(30) + "…");
  });

  it("primero quita el paréntesis y solo entonces mide", () => {
    // Si midiera antes, un texto corto con una coletilla larga se cortaría sin necesidad.
    const t = "Ana aprobó el corte (pendiente de pre-aprobación interna del responsable)";
    expect(corto(t, 30)).toBe("Ana aprobó el corte");
  });
});
