import { describe, it, expect } from "vitest";
import { plainExcerpt, headingSlug, extractHeadings, searchSnippet } from "./markdown";

describe("plainExcerpt (extracto en texto plano para las fichas de la wiki)", () => {
  it("quita la sintaxis de Markdown y separa cada idea con «·»", () => {
    const md = "## Antes de salir\n\nRevisar el **parte meteorológico** con 48 h.\n\n- [ ] Permisos firmados\n- Baterías cargadas";
    expect(plainExcerpt(md)).toBe("Antes de salir · Revisar el parte meteorológico con 48 h. · Permisos firmados · Baterías cargadas");
  });

  it("conserva los guiones bajos dentro de una palabra (nomenclaturas)", () => {
    expect(plainExcerpt("Usa CLIENTE_PROYECTO_vNN y nada de «final_final».")).toBe(
      "Usa CLIENTE_PROYECTO_vNN y nada de «final_final».",
    );
  });

  it("sí quita el énfasis con guion bajo cuando delimita una palabra", () => {
    expect(plainExcerpt("Esto es _importante_ de verdad")).toBe("Esto es importante de verdad");
  });

  it("deja el texto del enlace y descarta la URL", () => {
    expect(plainExcerpt("Ver el [protocolo de rodaje](https://ejemplo.com/x) completo")).toBe("Ver el protocolo de rodaje completo");
  });

  it("descarta imágenes, tablas y bloques de código", () => {
    const md = "![foto](/api/wiki-file/a.png)\n\nTexto útil\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```";
    expect(plainExcerpt(md)).toBe("Texto útil");
  });

  it("corta por palabra completa y añade puntos suspensivos", () => {
    const out = plainExcerpt("palabra ".repeat(40), 20);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(21);
    expect(out).not.toMatch(/pal…$/); // no parte una palabra por la mitad
  });

  it("no añade puntos suspensivos si cabe entero", () => {
    expect(plainExcerpt("Corto y claro", 180)).toBe("Corto y claro");
  });

  it("tolera contenido vacío", () => {
    expect(plainExcerpt("")).toBe("");
    expect(plainExcerpt("   \n\n  ")).toBe("");
  });
});

describe("headingSlug (ancla de un apartado)", () => {
  it("normaliza acentos, mayúsculas y espacios", () => {
    expect(headingSlug("En locación")).toBe("en-locacion");
    expect(headingSlug("¿Qué llevar?")).toBe("que-llevar");
  });

  it("nunca devuelve vacío", () => {
    expect(headingSlug("···")).toBe("seccion");
  });
});

describe("extractHeadings (índice de la página)", () => {
  it("recoge nivel, texto y ancla en orden", () => {
    const md = "# Título\n\nTexto\n\n## Antes de salir\n\n### Permisos\n\n## En locación";
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: "Título", slug: "titulo" },
      { level: 2, text: "Antes de salir", slug: "antes-de-salir" },
      { level: 3, text: "Permisos", slug: "permisos" },
      { level: 2, text: "En locación", slug: "en-locacion" },
    ]);
  });

  it("desambigua los encabezados repetidos", () => {
    const md = "## Notas\n## Notas\n## Notas";
    expect(extractHeadings(md).map((h) => h.slug)).toEqual(["notas", "notas-2", "notas-3"]);
  });

  it("ignora las almohadillas dentro de un bloque de código", () => {
    const md = "## Real\n\n```bash\n# esto es un comentario, no un encabezado\n```\n\n## También real";
    expect(extractHeadings(md).map((h) => h.text)).toEqual(["Real", "También real"]);
  });

  it("limpia el formato del propio encabezado", () => {
    expect(extractHeadings("## El **parte** meteorológico")[0]).toEqual({
      level: 2,
      text: "El parte meteorológico",
      slug: "el-parte-meteorologico",
    });
  });
});

describe("searchSnippet (el resultado dice la frase, no solo el título)", () => {
  const md = "## Entrega y respaldo\n\nAl cerrar el proyecto se hace el respaldo en dos discos distintos: uno se queda en el NAS y el otro va a la caja fuerte.";

  it("centra el trozo en la coincidencia y la marca", () => {
    const fr = searchSnippet(md, "respaldo");
    expect(fr.some((f) => f.marca && f.texto === "respaldo")).toBe(true);
    expect(fr.map((f) => f.texto).join("")).toContain("dos discos distintos");
  });

  it("marca TODAS las coincidencias del trozo", () => {
    expect(searchSnippet("uno respaldo dos respaldo tres", "respaldo").filter((f) => f.marca)).toHaveLength(2);
  });

  it("ignora mayúsculas y acentos pero devuelve el texto original", () => {
    const fr = searchSnippet("La ubicación del material", "UBICACION");
    const marcado = fr.find((f) => f.marca);
    expect(marcado?.texto).toBe("ubicación");
  });

  it("pone puntos suspensivos cuando recorta por delante", () => {
    const largo = "palabra ".repeat(60) + "aguja al final";
    expect(searchSnippet(largo, "aguja")[0].texto).toBe("…");
  });

  it("sin coincidencia devuelve el principio, sin marcas", () => {
    const fr = searchSnippet(md, "zzz-no-existe");
    expect(fr.every((f) => !f.marca)).toBe(true);
    expect(fr[0].texto.startsWith("Entrega y respaldo")).toBe(true);
  });

  it("tolera contenido vacío y consulta vacía", () => {
    expect(searchSnippet("", "algo")).toEqual([]);
    expect(searchSnippet(md, "  ")[0].marca).toBe(false);
  });
});

describe("searchSnippet con acentos descompuestos (NFD)", () => {
  it("resalta la palabra exacta aunque el texto venga descompuesto", () => {
    // En NFD la «ó» ocupa DOS posiciones (o + tilde suelta): así llega el texto de macOS.
    // Antes, los índices se desplazaban y el resaltado marcaba « aguj» en vez de «aguja».
    const nfd = "La ubicación del material es aguja aquí".normalize("NFD");
    const marcado = searchSnippet(nfd, "aguja").filter((f) => f.marca).map((f) => f.texto.normalize("NFC"));
    expect(marcado).toEqual(["aguja"]);
  });

  it("encuentra la palabra acentuada esté compuesta o descompuesta", () => {
    for (const forma of ["NFC", "NFD"] as const) {
      const t = "El mapa de ubicación del material".normalize(forma);
      const m = searchSnippet(t, "ubicacion").filter((f) => f.marca).map((f) => f.texto.normalize("NFC"));
      expect(m).toEqual(["ubicación"]);
    }
  });
});
