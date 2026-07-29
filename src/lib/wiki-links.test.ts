import { describe, it, expect } from "vitest";
import { wikiLinkKey, extractWikiLinks, resolveWikiLinks, wikiTitleIndex, wikiLinkPrefilter } from "./wiki-links";

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

describe("regresión: el índice y el render deben producir el MISMO ancla", () => {
  it("con un encabezado que lleva [[Título|alias]]", async () => {
    const { extractHeadings, renderMarkdown } = await import("./markdown");
    const md = "## Guía de [[Rodaje|campo]]\n\nTexto";
    const i = wikiTitleIndex([{ id: "abc123", title: "Rodaje" }]);
    const resuelto = resolveWikiLinks(md, i);
    // Ambos deben partir del MISMO texto: el original daría «guia-de-rodaje» y el
    // renderizado «guia-de-campo», y el enlace del índice no saltaría.
    const delIndice = extractHeadings(resuelto)[0].slug;
    const delRender = /id="([^"]+)"/.exec(renderMarkdown(resuelto, { headingIds: true }))?.[1];
    expect(delRender).toBe(delIndice);
  });
});

describe("wikiLinkPrefilter (prefiltro SQL que no pierde enlaces sin tilde)", () => {
  it("devuelve el trozo más largo sin letras acentuadas", () => {
    // Así el prefiltro casa tanto con «Ubicación del material» como con «Ubicacion del material».
    const p = wikiLinkPrefilter("Ubicación del material")!;
    expect("Ubicación del material").toContain(p);
    expect("Ubicacion del material").toContain(p);
  });

  it("sirve igual para títulos sin acentos", () => {
    const p = wikiLinkPrefilter("Protocolo de rodaje")!;
    expect("Protocolo de rodaje").toContain(p);
    expect(p.length).toBeGreaterThanOrEqual(4);
  });

  it("devuelve null si no queda un trozo aprovechable", () => {
    expect(wikiLinkPrefilter("Áéí")).toBeNull();
    expect(wikiLinkPrefilter("ó")).toBeNull();
  });
});
