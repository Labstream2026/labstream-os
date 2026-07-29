import { describe, it, expect } from "vitest";
import { wikiLinkKey, extractWikiLinks, resolveWikiLinks, wikiTitleIndex } from "./wiki-links";

const PAGS = [
  { id: "p1", title: "Flujo de post-producción" },
  { id: "p2", title: "Protocolo de rodaje" },
  { id: "p3", title: "Tarifas 2026" },
];
const idx = wikiTitleIndex(PAGS);

describe("wikiLinkKey (comparación de títulos)", () => {
  it("ignora mayúsculas, acentos y espacios de más", () => {
    expect(wikiLinkKey("  Flujo de POST-Producción  ")).toBe(wikiLinkKey("flujo de post-produccion"));
  });
});

describe("extractWikiLinks (a qué páginas apunta un contenido)", () => {
  it("recoge los títulos sin repetir y en orden", () => {
    const md = "Ver [[Tarifas 2026]] y luego [[Protocolo de rodaje]]. Otra vez [[tarifas 2026]].";
    expect(extractWikiLinks(md)).toEqual(["Tarifas 2026", "Protocolo de rodaje"]);
  });

  it("entiende la forma [[Título|texto visible]]", () => {
    expect(extractWikiLinks("Mira el [[Protocolo de rodaje|protocolo]] antes de salir")).toEqual(["Protocolo de rodaje"]);
  });

  it("no confunde un enlace Markdown normal con uno de wiki", () => {
    expect(extractWikiLinks("[texto](https://ejemplo.com) y [otro](/wiki/x)")).toEqual([]);
  });

  it("tolera contenido vacío o corchetes sueltos", () => {
    expect(extractWikiLinks("")).toEqual([]);
    expect(extractWikiLinks("[[sin cerrar")).toEqual([]);
    expect(extractWikiLinks("[[]]")).toEqual([]);
  });
});

describe("resolveWikiLinks (de [[…]] a enlace real)", () => {
  it("convierte el enlace en una ruta de la wiki", () => {
    expect(resolveWikiLinks("Ver [[Tarifas 2026]] hoy", idx)).toBe("Ver [Tarifas 2026](/wiki/p3) hoy");
  });

  it("usa el texto visible cuando se indica", () => {
    expect(resolveWikiLinks("[[Tarifas 2026|nuestras tarifas]]", idx)).toBe("[nuestras tarifas](/wiki/p3)");
  });

  it("resuelve aunque el título se escriba sin acentos ni mayúsculas", () => {
    expect(resolveWikiLinks("[[flujo de post-produccion]]", idx)).toBe("[flujo de post-produccion](/wiki/p1)");
  });

  it("deja el texto en corchetes simples si la página no existe", () => {
    expect(resolveWikiLinks("[[Página que no existe]]", idx)).toBe("[Página que no existe]");
  });

  it("no toca los enlaces Markdown normales ni las imágenes", () => {
    const md = "![foto](/api/wiki-file/a.png) y [web](https://x.com)";
    expect(resolveWikiLinks(md, idx)).toBe(md);
  });

  it("resuelve varios enlaces en la misma línea", () => {
    expect(resolveWikiLinks("[[Tarifas 2026]] y [[Protocolo de rodaje]]", idx)).toBe(
      "[Tarifas 2026](/wiki/p3) y [Protocolo de rodaje](/wiki/p2)",
    );
  });

  it("quita los corchetes del texto visible para no romper el enlace", () => {
    expect(resolveWikiLinks("[[Tarifas 2026|ver [aquí]]]", idx)).toContain("](/wiki/p3)");
  });
});

describe("wikiTitleIndex", () => {
  it("con títulos repetidos gana la primera página", () => {
    const m = wikiTitleIndex([{ id: "a", title: "Notas" }, { id: "b", title: "notas" }]);
    expect(m.get(wikiLinkKey("Notas"))).toBe("a");
  });
});
