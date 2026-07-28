import { readZipText, readZipTexts } from "./zip-read";

// ── Los comentarios que la gente deja DENTRO del documento ──
// OnlyOffice no nos avisa cuando alguien comenta: los comentarios viajan dentro del propio
// archivo. Al guardar, se leen de ahí para poder avisar al equipo, listarlos fuera del editor
// y convertirlos en tareas. Es lectura pura: no se toca el archivo.
//
// Cada formato los guarda en su sitio:
//  · Word  → word/comments.xml (+ commentsExtended.xml dice cuáles están resueltos).
//  · Excel → xl/threadedComments/*.xml (los modernos, con hilo) o xl/comments*.xml (los viejos).
//  · Power Point → ppt/comments/*.xml con los autores en ppt/commentAuthors.xml.

export type DocComment = {
  // Identificador DENTRO del documento: lo que permite reconocer un comentario ya visto.
  extId: string;
  author: string;
  text: string;
  at: Date | null;
  resolved: boolean;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

// Texto legible de un trozo de XML: se juntan las piezas de texto (<w:t>, <a:t>, <t>, <text>)
// y se quitan las etiquetas. Los saltos de párrafo se vuelven espacio.
function plainText(xml: string): string {
  const piezas = [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => m[1]);
  const crudo = piezas.length ? piezas.join("") : xml.replace(/<[^>]*>/g, " ");
  return decode(crudo).replace(/\s+/g, " ").trim();
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name.replace(":", "\\:")}="([^"]*)"`));
  return m ? decode(m[1]) : null;
}

function toDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function cortar(s: string): string {
  return s.length > 2000 ? `${s.slice(0, 1997)}…` : s;
}

// ── Word ──
function wordComments(buf: Buffer): DocComment[] {
  const xml = readZipText(buf, "word/comments.xml");
  if (!xml) return [];

  // commentsExtended marca los resueltos por paraId (el id del ÚLTIMO párrafo del comentario).
  const resueltos = new Set<string>();
  const ext = readZipText(buf, "word/commentsExtended.xml");
  if (ext) {
    for (const m of ext.matchAll(/<w15:commentEx\b[^>]*\/?>/g)) {
      const done = attr(m[0], "w15:done");
      const paraId = attr(m[0], "w15:paraId");
      if (paraId && (done === "1" || done === "true")) resueltos.add(paraId.toUpperCase());
    }
  }

  const out: DocComment[] = [];
  for (const m of xml.matchAll(/<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g)) {
    const abre = `<w:comment${m[1]}>`;
    const id = attr(abre, "w:id");
    if (id === null) continue;
    const cuerpo = m[2];
    const paraIds = [...cuerpo.matchAll(/\sw14:paraId="([^"]*)"/g)].map((p) => p[1].toUpperCase());
    out.push({
      extId: `w:${id}`,
      author: attr(abre, "w:author") || "Alguien",
      text: cortar(plainText(cuerpo)),
      at: toDate(attr(abre, "w:date")),
      resolved: paraIds.some((p) => resueltos.has(p)),
    });
  }
  return out;
}

// ── Excel ──
function cellComments(buf: Buffer): DocComment[] {
  // Modernos (con hilo): las personas viven en xl/persons/person.xml.
  const personas = new Map<string, string>();
  const person = readZipText(buf, "xl/persons/person.xml");
  if (person) {
    for (const m of person.matchAll(/<person\b[^>]*\/?>/g)) {
      const id = attr(m[0], "id");
      const nombre = attr(m[0], "displayName");
      if (id) personas.set(id, nombre || "Alguien");
    }
  }
  const hilos: DocComment[] = [];
  for (const parte of readZipTexts(buf, /^xl\/threadedComments\/threadedComment\d*\.xml$/)) {
    for (const m of parte.text.matchAll(/<threadedComment\b([^>]*)>([\s\S]*?)<\/threadedComment>/g)) {
      const abre = `<threadedComment${m[1]}>`;
      const id = attr(abre, "id");
      if (!id) continue;
      const done = attr(abre, "done");
      hilos.push({
        extId: `x:${id}`,
        author: personas.get(attr(abre, "personId") || "") || "Alguien",
        text: cortar(`${attr(abre, "ref") ? `[${attr(abre, "ref")}] ` : ""}${plainText(m[2])}`),
        at: toDate(attr(abre, "dT")),
        resolved: done === "1" || done === "true",
      });
    }
  }
  // Con comentarios modernos, Excel duplica los viejos con autor «tc={guid}» solo por
  // compatibilidad: se ignoran para no listar cada nota dos veces.
  if (hilos.length) return hilos;

  const out: DocComment[] = [];
  for (const parte of readZipTexts(buf, /^xl\/comments\d*\.xml$/)) {
    const autores = [...parte.text.matchAll(/<author>([\s\S]*?)<\/author>/g)].map((a) => decode(a[1]).trim());
    for (const m of parte.text.matchAll(/<comment\b([^>]*)>([\s\S]*?)<\/comment>/g)) {
      const abre = `<comment${m[1]}>`;
      const ref = attr(abre, "ref") || "";
      const autor = autores[Number(attr(abre, "authorId") ?? "0")] || "Alguien";
      if (/^tc=\{/i.test(autor)) continue;
      out.push({
        extId: `xl:${parte.name}:${ref}`,
        author: autor,
        text: cortar(`${ref ? `[${ref}] ` : ""}${plainText(m[2])}`),
        at: null, // los comentarios viejos de Excel no guardan fecha
        resolved: false,
      });
    }
  }
  return out;
}

// ── Power Point ──
function slideComments(buf: Buffer): DocComment[] {
  const autores = new Map<string, string>();
  const lista = readZipText(buf, "ppt/commentAuthors.xml");
  if (lista) {
    for (const m of lista.matchAll(/<p:cmAuthor\b[^>]*\/?>/g)) {
      const id = attr(m[0], "id");
      if (id) autores.set(id, attr(m[0], "name") || "Alguien");
    }
  }
  const out: DocComment[] = [];
  for (const parte of readZipTexts(buf, /^ppt\/comments\/(modern)?[Cc]omment\d*\.xml$/)) {
    for (const m of parte.text.matchAll(/<p:cm\b([^>]*)>([\s\S]*?)<\/p:cm>/g)) {
      const abre = `<p:cm${m[1]}>`;
      const idx = attr(abre, "idx") ?? "0";
      const autorId = attr(abre, "authorId") ?? "0";
      out.push({
        extId: `p:${parte.name}:${autorId}:${idx}`,
        author: autores.get(autorId) || "Alguien",
        text: cortar(plainText(m[2].replace(/<p:pos\b[^>]*\/?>/g, ""))),
        at: toDate(attr(abre, "dt")),
        resolved: false, // los comentarios de Power Point no tienen estado «resuelto»
      });
    }
  }
  return out;
}

// Comentarios que hay AHORA MISMO dentro del archivo. `tipo` es el que devuelve `officeType`
// (se recibe hecho para que este módulo no dependa de nada). Nunca lanza: si el archivo viene
// raro, devuelve una lista vacía y el guardado sigue su camino.
export function readDocComments(buf: Buffer, tipo: "word" | "cell" | "slide" | "pdf" | null): DocComment[] {
  try {
    const raw =
      tipo === "word" ? wordComments(buf) : tipo === "cell" ? cellComments(buf) : tipo === "slide" ? slideComments(buf) : [];
    // Un comentario vacío (solo formato) no aporta nada: no se guarda ni avisa.
    return raw.filter((c) => c.text.length > 0);
  } catch (e) {
    console.error("[docs] no se pudieron leer los comentarios:", e instanceof Error ? e.message : e);
    return [];
  }
}
