import { describe, expect, it } from "vitest";
import { CACHE_MINIATURA, CACHE_PREVISUALIZACION, cabecerasWebp, etagDe, yaLaTiene } from "./cache-imagen";

// Lo que se está protegiendo: que una miniatura ya vista NO se vuelva a bajar entera. Con
// internet lento eso es la diferencia entre un panel de archivos que abre al instante y uno
// que se arrastra. Si alguien cambia el ETag por uno basado en fecha, estas pruebas caen.

const img = (s: string) => Buffer.from(s, "utf8");

describe("etagDe", () => {
  it("los mismos bytes dan el mismo ETag", () => {
    expect(etagDe(img("miniatura-a"))).toBe(etagDe(img("miniatura-a")));
  });

  it("bytes distintos dan ETags distintos", () => {
    expect(etagDe(img("miniatura-a"))).not.toBe(etagDe(img("miniatura-b")));
  });

  it("va entre comillas, como manda HTTP", () => {
    expect(etagDe(img("x"))).toMatch(/^"[A-Za-z0-9_-]+"$/);
  });
});

describe("cabecerasWebp", () => {
  it("la miniatura se guarda un día; la previsualización siempre pregunta", () => {
    expect(cabecerasWebp(img("x"), "foto.jpg", true)["Cache-Control"]).toBe(CACHE_MINIATURA);
    expect(cabecerasWebp(img("x"), "foto.jpg", false)["Cache-Control"]).toBe(CACHE_PREVISUALIZACION);
  });

  it("ninguna de las dos es pública: el material del cliente no se cachea compartido", () => {
    expect(CACHE_MINIATURA.startsWith("private")).toBe(true);
    expect(CACHE_PREVISUALIZACION.startsWith("private")).toBe(true);
  });

  it("escapa el nombre del archivo (tildes y espacios rompen la cabecera)", () => {
    const h = cabecerasWebp(img("x"), "Diseño final.jpg", true);
    expect(h["Content-Disposition"]).toBe("inline; filename*=UTF-8''Dise%C3%B1o%20final.jpg");
  });
});

describe("yaLaTiene", () => {
  const etag = etagDe(img("miniatura-a"));

  it("sin cabecera, no la tiene", () => {
    expect(yaLaTiene(null, etag)).toBe(false);
    expect(yaLaTiene("", etag)).toBe(false);
  });

  it("reconoce el suyo", () => {
    expect(yaLaTiene(etag, etag)).toBe(true);
  });

  it("acepta el débil que ponen algunos intermediarios", () => {
    expect(yaLaTiene(`W/${etag}`, etag)).toBe(true);
  });

  it("acepta una lista y encuentra el suyo dentro", () => {
    expect(yaLaTiene(`"otro", ${etag}, "y-otro"`, etag)).toBe(true);
  });

  it("no confunde una imagen distinta", () => {
    expect(yaLaTiene(etagDe(img("miniatura-b")), etag)).toBe(false);
  });
});
