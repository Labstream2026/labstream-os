import { describe, it, expect } from "vitest";
import { buildWikiTree, wikiBreadcrumb, wikiDescendants, type WikiNodeInput } from "./wiki-tree";

const SECCIONES = ["Empieza aquí", "Cómo trabajamos", "Administración"] as const;
const d = new Date("2026-01-01");

function p(id: string, title: string, section: string | null, parentId: string | null = null): WikiNodeInput {
  return { id, title, icon: null, section, parentId, updatedAt: d };
}

describe("buildWikiTree (árbol de páginas de la wiki)", () => {
  it("agrupa por sección y anida a las hijas bajo su madre", () => {
    const arbol = buildWikiTree(
      [
        p("a", "Post-producción", "Cómo trabajamos"),
        p("b", "Nomenclatura", "Cómo trabajamos", "a"),
        p("c", "Entrega", "Cómo trabajamos", "a"),
        p("d", "Tarifas", "Administración"),
      ],
      SECCIONES,
    );
    expect(arbol.map((g) => g.section)).toEqual(["Cómo trabajamos", "Administración"]);
    expect(arbol[0].paginas).toHaveLength(1);
    expect(arbol[0].paginas[0].title).toBe("Post-producción");
    expect(arbol[0].paginas[0].hijos.map((h) => h.title)).toEqual(["Entrega", "Nomenclatura"]);
    expect(arbol[1].paginas.map((x) => x.title)).toEqual(["Tarifas"]);
  });

  it("respeta el orden de secciones y manda «Otras páginas» al final", () => {
    const arbol = buildWikiTree(
      [p("x", "Suelta", "Sección inventada"), p("y", "Bienvenida", "Empieza aquí"), p("z", "Sin sección", null)],
      SECCIONES,
    );
    expect(arbol.map((g) => g.section)).toEqual(["Empieza aquí", "Otras páginas"]);
    expect(arbol[1].paginas.map((n) => n.title)).toEqual(["Sin sección", "Suelta"]);
  });

  it("ordena alfabéticamente ignorando mayúsculas y acentos", () => {
    const arbol = buildWikiTree(
      [p("1", "ándalo", "Empieza aquí"), p("2", "Ana", "Empieza aquí"), p("3", "zapato", "Empieza aquí")],
      SECCIONES,
    );
    expect(arbol[0].paginas.map((n) => n.title)).toEqual(["Ana", "ándalo", "zapato"]);
  });

  it("sube a su sección la hija cuya madre no existe", () => {
    const arbol = buildWikiTree([p("h", "Huérfana", "Administración", "no-existe")], SECCIONES);
    expect(arbol[0].section).toBe("Administración");
    expect(arbol[0].paginas.map((n) => n.title)).toEqual(["Huérfana"]);
  });

  it("no entra en bucle con un ciclo de madres", () => {
    const arbol = buildWikiTree(
      [p("a", "A", "Administración", "b"), p("b", "B", "Administración", "a")],
      SECCIONES,
    );
    // Ninguna se pierde y ninguna queda anidada dentro de la otra.
    expect(arbol[0].paginas.map((n) => n.title).sort()).toEqual(["A", "B"]);
    expect(arbol[0].paginas.every((n) => n.hijos.length === 0)).toBe(true);
  });

  it("corta el anidamiento en la profundidad máxima", () => {
    const cadena = ["n1", "n2", "n3", "n4", "n5", "n6"].map((id, i) =>
      p(id, `Nivel ${i + 1}`, "Cómo trabajamos", i === 0 ? null : `n${i}`),
    );
    const arbol = buildWikiTree(cadena, SECCIONES);
    let nodo = arbol[0].paginas[0];
    let prof = 1;
    while (nodo.hijos.length) { nodo = nodo.hijos[0]; prof++; }
    expect(prof).toBe(4);
  });
});

describe("wikiBreadcrumb (migas de pan)", () => {
  it("devuelve la ruta desde la raíz hasta la página", () => {
    const pages = [p("a", "Post", "Cómo trabajamos"), p("b", "Entrega", "Cómo trabajamos", "a"), p("c", "Discos", "Cómo trabajamos", "b")];
    expect(wikiBreadcrumb(pages, "c").map((x) => x.title)).toEqual(["Post", "Entrega", "Discos"]);
  });

  it("devuelve solo la página si no tiene madre", () => {
    expect(wikiBreadcrumb([p("a", "Sola", null)], "a").map((x) => x.title)).toEqual(["Sola"]);
  });

  it("no se cuelga con un ciclo", () => {
    const pages = [p("a", "A", null, "b"), p("b", "B", null, "a")];
    expect(wikiBreadcrumb(pages, "a").length).toBeLessThanOrEqual(2);
  });

  it("devuelve vacío si la página no existe", () => {
    expect(wikiBreadcrumb([p("a", "A", null)], "zzz")).toEqual([]);
  });
});

describe("wikiDescendants (madres prohibidas al mover una página)", () => {
  it("incluye la propia página y toda su descendencia", () => {
    const pages = [p("a", "A", null), p("b", "B", null, "a"), p("c", "C", null, "b"), p("d", "D", null)];
    expect([...wikiDescendants(pages, "a")].sort()).toEqual(["a", "b", "c"]);
  });

  it("una hoja solo se incluye a sí misma", () => {
    expect([...wikiDescendants([p("a", "A", null), p("b", "B", null, "a")], "b")]).toEqual(["b"]);
  });

  it("no se cuelga con un ciclo", () => {
    const pages = [p("a", "A", null, "b"), p("b", "B", null, "a")];
    expect([...wikiDescendants(pages, "a")].sort()).toEqual(["a", "b"]);
  });
});
