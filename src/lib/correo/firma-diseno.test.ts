import { describe, expect, it } from "vitest";
import { DISENO_BASE, generarHtmlFirma, normalizarDiseno } from "./firma-diseno";
import { aplicarPlantillaFirma, sanearSaliente } from "./redactar";

const d = { ...DISENO_BASE, telefono: "+57 300 000 0000", redes: [{ etiqueta: "Instagram", url: "instagram.com/labstream" }] };

describe("generarHtmlFirma", () => {
  it("lleva los campos, el acento y los datos — y el logo por cid solo si hay logo", () => {
    const con = generarHtmlFirma(d, { conImagen: true });
    expect(con).toContain("{{nombre}}");
    expect(con).toContain("{{cargo}}");
    expect(con).toContain(DISENO_BASE.acento);
    expect(con).toContain("cid:firma@labstream");
    expect(con).toContain("https://instagram.com/labstream");
    const sin = generarHtmlFirma(d, { conImagen: false });
    expect(sin).not.toContain("cid:");
  });

  it("cada layout tiene su forma: clásica al lado, apilada y banner debajo", () => {
    const clasica = generarHtmlFirma({ ...d, layout: "clasica" }, { conImagen: true });
    expect(clasica).toMatch(/<td[^>]*><img[^>]*><\/td><td/); // logo y texto en la MISMA fila
    const apilada = generarHtmlFirma({ ...d, layout: "apilada" }, { conImagen: true });
    expect(apilada).toMatch(/<\/tr><tr><td[^>]*><img/); // el logo en su propia fila
    const banner = generarHtmlFirma({ ...d, layout: "banner" }, { conImagen: true });
    expect(banner).toContain('width="420"');
  });

  it("SOBREVIVE al saneador de salida: la tabla, el vertical-align y el cid quedan", () => {
    const limpio = sanearSaliente(generarHtmlFirma(d, { conImagen: true }));
    expect(limpio).toContain("<table");
    expect(limpio).toContain("vertical-align:middle");
    expect(limpio).toContain("cid:firma@labstream");
    expect(limpio).toContain("border-left:3px solid");
  });

  it("un nombre malicioso en la empresa no inyecta HTML (queda escapado, inerte)", () => {
    const html = generarHtmlFirma({ ...d, empresa: `<img src=x onerror=alert(1)>` }, { conImagen: false });
    expect(html).not.toContain("<img src=x"); // ninguna etiqueta viva
    expect(html).toContain("&lt;img"); // solo texto escapado
    expect(sanearSaliente(html)).not.toMatch(/<[^>]*onerror/i); // y jamás dentro de una etiqueta
  });
});

describe("normalizarDiseno", () => {
  it("acota, valida y descarta lo inservible", () => {
    const n = normalizarDiseno({
      layout: "banner",
      acento: "#ff0000", // fuera de paleta → al acento base
      empresa: "  Labstream  ",
      redes: [
        { etiqueta: "IG", url: "instagram.com/x" },
        { etiqueta: "rota", url: "javascript:alert(1)" }, // esquema inválido → fuera
      ],
      anchoImagen: 999,
    });
    expect(n?.layout).toBe("banner");
    expect(n?.acento).toBe(DISENO_BASE.acento);
    expect(n?.empresa).toBe("Labstream");
    expect(n?.redes).toHaveLength(1);
    expect(n?.anchoImagen).toBe(160);
    expect(normalizarDiseno("basura")).toBeNull();
    expect(normalizarDiseno(null)).toBeNull();
  });
});

describe("aplicarPlantillaFirma con campos vacíos", () => {
  it("sin cargo NO queda renglón en blanco (se barre el span vacío y su salto)", () => {
    const html = generarHtmlFirma(d, { conImagen: false });
    const sinCargo = aplicarPlantillaFirma(html, { nombre: "Diana Ruiz", cargo: "" });
    expect(sinCargo).toContain("Diana Ruiz");
    expect(sinCargo).not.toMatch(/<span[^>]*>\s*<\/span>/);
    expect(sinCargo).not.toContain("Diana Ruiz</b><br><br>");
    const conCargo = aplicarPlantillaFirma(html, { nombre: "Diana Ruiz", cargo: "Productora" });
    expect(conCargo).toContain("Productora");
  });
});
