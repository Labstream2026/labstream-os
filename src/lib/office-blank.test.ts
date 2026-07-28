import { describe, it, expect } from "vitest";
import { zipNames, readZipText } from "./zip-read";
import { blankOffice, withDocExt, NEW_DOC_EXT } from "./office-blank";

// Un OOXML solo abre si el paquete está COMPLETO: los tipos de contenido, la relación raíz y
// cada pieza que se declara. Aquí se comprueba esa cadena, que es lo que rompe en silencio.
function piezas(kind: Parameters<typeof blankOffice>[0]) {
  return zipNames(blankOffice(kind));
}

// Todas las piezas a las que apunta una lista de relaciones tienen que existir de verdad.
function relacionesResueltas(buf: Buffer, relsPath: string): string[] {
  const xml = readZipText(buf, relsPath) ?? "";
  const carpeta = relsPath.replace(/_rels\/[^/]+$/, "");
  return [...xml.matchAll(/Target="([^"]+)"/g)].map((m) => {
    const t = m[1];
    // Las rutas relativas («../theme/theme1.xml») se resuelven contra la carpeta del dueño.
    const partes = `${carpeta}${t}`.split("/");
    const out: string[] = [];
    for (const p of partes) {
      if (p === "..") out.pop();
      else if (p && p !== ".") out.push(p);
    }
    return out.join("/");
  });
}

describe("blankOffice · Word", () => {
  it("trae el documento y su relación raíz", () => {
    const names = piezas("word");
    expect(names).toContain("[Content_Types].xml");
    expect(names).toContain("_rels/.rels");
    expect(names).toContain("word/document.xml");
  });
});

describe("blankOffice · Excel", () => {
  const buf = blankOffice("cell");

  it("trae libro, hoja y estilos", () => {
    const names = zipNames(buf);
    expect(names).toEqual(
      expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]),
    );
  });

  it("la hoja se llama Hoja1 y está vacía", () => {
    expect(readZipText(buf, "xl/workbook.xml")).toContain('name="Hoja1"');
    expect(readZipText(buf, "xl/worksheets/sheet1.xml")).toContain("<sheetData/>");
  });

  it("cada relación apunta a una pieza que existe", () => {
    const names = new Set(zipNames(buf));
    for (const rels of ["_rels/.rels", "xl/_rels/workbook.xml.rels"]) {
      for (const destino of relacionesResueltas(buf, rels)) expect(names.has(destino), `falta ${destino}`).toBe(true);
    }
  });

  it("todo lo declarado en los tipos de contenido está en el paquete", () => {
    const names = new Set(zipNames(buf));
    const tipos = readZipText(buf, "[Content_Types].xml") ?? "";
    for (const m of tipos.matchAll(/PartName="\/([^"]+)"/g)) expect(names.has(m[1]), `falta ${m[1]}`).toBe(true);
  });
});

describe("blankOffice · Power Point", () => {
  const buf = blankOffice("slide");

  it("trae la cadena completa: presentación, patrón, diseño, diapositiva y tema", () => {
    expect(zipNames(buf)).toEqual(
      expect.arrayContaining([
        "ppt/presentation.xml",
        "ppt/slideMasters/slideMaster1.xml",
        "ppt/slideLayouts/slideLayout1.xml",
        "ppt/slides/slide1.xml",
        "ppt/theme/theme1.xml",
      ]),
    );
  });

  it("es una diapositiva 16:9", () => {
    expect(readZipText(buf, "ppt/presentation.xml")).toContain('<p:sldSz cx="12192000" cy="6858000"/>');
  });

  it("cada relación apunta a una pieza que existe", () => {
    const names = new Set(zipNames(buf));
    const listas = [
      "_rels/.rels",
      "ppt/_rels/presentation.xml.rels",
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      "ppt/slides/_rels/slide1.xml.rels",
    ];
    for (const rels of listas) {
      const destinos = relacionesResueltas(buf, rels);
      expect(destinos.length, `${rels} sin relaciones`).toBeGreaterThan(0);
      for (const destino of destinos) expect(names.has(destino), `falta ${destino}`).toBe(true);
    }
  });

  it("el tema trae los cuatro bloques de formato que exige el formato", () => {
    const tema = readZipText(buf, "ppt/theme/theme1.xml") ?? "";
    for (const bloque of ["a:clrScheme", "a:fontScheme", "a:fillStyleLst", "a:lnStyleLst", "a:effectStyleLst", "a:bgFillStyleLst"]) {
      expect(tema).toContain(`<${bloque}`);
    }
  });
});

describe("withDocExt", () => {
  it("pone la extensión que toca", () => {
    expect(withDocExt("Presupuesto", "cell")).toBe("Presupuesto.xlsx");
    expect(withDocExt("Guion", "word")).toBe("Guion.docx");
    expect(withDocExt("Pitch", "slide")).toBe("Pitch.pptx");
  });

  it("no la repite si ya la trae (en cualquier capitalización)", () => {
    expect(withDocExt("Guion.docx", "word")).toBe("Guion.docx");
    expect(withDocExt("Guion.DOCX", "word")).toBe("Guion.DOCX");
  });

  it("un nombre vacío no deja el archivo sin nombre", () => {
    expect(withDocExt("   ", "word")).toBe("Documento sin título.docx");
  });

  it("las extensiones son las de Office", () => {
    expect(NEW_DOC_EXT).toEqual({ word: "docx", cell: "xlsx", slide: "pptx" });
  });
});
