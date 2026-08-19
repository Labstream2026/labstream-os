import { describe, expect, it } from "vitest";
import { esNavegador, franjaDe, sitioDe } from "./navegacion";

// Lo delicado de la navegación: (1) que el clasificador no invente sitios a partir de títulos
// truncados o raros — lo no reconocido debe caer en «Otros», nunca enseñar basura — y (2) que
// la franja horaria sea la de BOGOTÁ, no la del servidor.

describe("esNavegador", () => {
  it("reconoce los navegadores por el nombre de la app, sin importar mayúsculas", () => {
    expect(esNavegador("Google Chrome")).toBe(true);
    expect(esNavegador("Microsoft Edge")).toBe(true);
    expect(esNavegador("firefox")).toBe(true);
    expect(esNavegador("DaVinci Resolve")).toBe(false);
    expect(esNavegador("Adobe Premiere Pro")).toBe(false);
  });
  it("los hosts WebView2 NO son navegación (apps de escritorio con motor embebido)", () => {
    expect(esNavegador("Microsoft Edge WebView2")).toBe(false);
    expect(esNavegador("msedgewebview2")).toBe(false);
  });
});

describe("sitioDe", () => {
  it("clasifica los sitios de ocio comunes desde el título completo", () => {
    expect(sitioDe("Mi video favorito - YouTube - Google Chrome")).toEqual({ nombre: "YouTube", cat: "ocio" });
    expect(sitioDe("Instagram - Microsoft Edge")).toEqual({ nombre: "Instagram", cat: "ocio" });
  });

  it("WhatsApp es mensajería, no ocio: aquí es el canal de clientes", () => {
    expect(sitioDe("(3) WhatsApp - Google Chrome")).toEqual({ nombre: "WhatsApp", cat: "mensajeria" });
  });

  it("clasifica las herramientas de trabajo", () => {
    expect(sitioDe("Brief Skala - Documentos de Google - Google Chrome")?.cat).toBe("trabajo");
    expect(sitioDe("Revisiones · Labstream OS")).toEqual({ nombre: "Labstream OS", cat: "trabajo" });
    expect(sitioDe("Proyecto reel - Frame.io - Firefox")?.nombre).toBe("Frame.io");
  });

  it("gana el sitio de MÁS a la derecha: el guion de un reel para Instagram NO es ocio en Instagram", () => {
    // El caso común de una productora de contenido: la red social vive en el NOMBRE del
    // documento y el sitio real (Docs, Canva) en el sufijo del título.
    expect(sitioDe("Guion reel Instagram - Documentos de Google - Google Chrome")).toEqual({ nombre: "Google Docs", cat: "trabajo" });
    expect(sitioDe("Post Facebook agosto - Canva - Google Chrome")).toEqual({ nombre: "Canva", cat: "trabajo" });
  });

  it("las claves cortas exigen borde de palabra: ni Sheinbaum ni Temuco ni canvas son tiendas", () => {
    expect(sitioDe("Claudia Sheinbaum anuncia reforma - El Tiempo - Google Chrome")).toBeNull();
    expect(sitioDe("Clima en Temuco hoy - Google Chrome")).toBeNull();
    expect(sitioDe("HTML canvas tutorial - MDN - Google Chrome")).toBeNull();
    expect(sitioDe("Resultados 3 / xx paginas - Google Chrome")).toBeNull();
    // Y los reales siguen casando:
    expect(sitioDe("Carrito - Shein - Google Chrome")?.nombre).toBe("Shein");
    expect(sitioDe("Inicio / X - Google Chrome")?.nombre).toBe("X (Twitter)");
  });

  it("sobrevive a un título truncado que perdió el sufijo del navegador", () => {
    // El sensor corta a 140: la palabra clave puede quedar en cualquier parte.
    expect(sitioDe("Cómo animar títulos en DaVinci - YouTube")).toEqual({ nombre: "YouTube", cat: "ocio" });
  });

  it("lo desconocido devuelve null (cae en «Otros sitios», sin enseñar el título)", () => {
    expect(sitioDe("Página rarísima de un foro - Google Chrome")).toBeNull();
    expect(sitioDe("")).toBeNull();
  });
});

describe("franjaDe", () => {
  // Bogotá es UTC-5 fijo (sin horario de verano).
  it("convierte a franja de Bogotá, no del servidor", () => {
    expect(franjaDe(new Date("2026-08-18T14:00:00Z"))).toBe(1); // 9 a. m. Bogotá → mañana
    expect(franjaDe(new Date("2026-08-18T20:00:00Z"))).toBe(2); // 3 p. m. Bogotá → tarde
    expect(franjaDe(new Date("2026-08-19T01:00:00Z"))).toBe(3); // 8 p. m. Bogotá → noche
    expect(franjaDe(new Date("2026-08-18T08:00:00Z"))).toBe(0); // 3 a. m. Bogotá → madrugada
  });
  it("los bordes caen donde deben", () => {
    expect(franjaDe(new Date("2026-08-18T11:00:00Z"))).toBe(1); // 6:00 a. m. exactas → mañana
    expect(franjaDe(new Date("2026-08-18T23:00:00Z"))).toBe(3); // 6:00 p. m. exactas → noche
    expect(franjaDe(new Date("2026-08-18T22:59:00Z"))).toBe(2); // 5:59 p. m. → tarde
  });
});
