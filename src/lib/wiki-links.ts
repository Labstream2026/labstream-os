// Enlaces ENTRE páginas de la Wiki: `[[Título de la página]]`, o `[[Título|como se lee]]`.
// Se resuelven por TÍTULO (no por id) porque es lo que la gente escribe y lo que puede
// autocompletar; el id se busca al pintar. Así el conocimiento forma una red y se puede
// responder «¿qué depende de esta página?» sin buscar URLs a mano.

// Un título se compara sin acentos, sin mayúsculas y con los espacios colapsados: escribir
// «post-producción» o «Post Producción» debe llegar a la misma página.
export function wikiLinkKey(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// `[[Título]]` o `[[Título|texto visible]]`. El título no puede contener ] ni |.
const WIKILINK = /\[\[([^\]|]{1,200})(?:\|([^\]]{1,200}))?\]\]/g;

/** Títulos a los que enlaza un contenido (sin repetir, en orden de aparición). */
export function extractWikiLinks(md: string): string[] {
  if (!md) return [];
  const out: string[] = [];
  const vistos = new Set<string>();
  for (const m of md.matchAll(WIKILINK)) {
    const titulo = m[1].trim();
    if (!titulo) continue;
    const key = wikiLinkKey(titulo);
    if (vistos.has(key)) continue;
    vistos.add(key);
    out.push(titulo);
  }
  return out;
}

/**
 * Reescribe los `[[…]]` como enlaces Markdown normales antes de renderizar:
 * - si la página existe → `[texto](/wiki/<id>)`;
 * - si NO existe → se deja el texto entre corchetes simples, para que se note que
 *   está roto sin llevar a una página que no está (un enlace a la nada frustra más).
 * Se hace ANTES de `renderMarkdown`, que es quien escapa el HTML.
 */
export function resolveWikiLinks(md: string, porTitulo: Map<string, string>): string {
  if (!md) return md;
  return md.replace(WIKILINK, (_m, rawTitulo: string, rawTexto?: string) => {
    const titulo = rawTitulo.trim();
    const texto = (rawTexto ?? titulo).trim() || titulo;
    const id = porTitulo.get(wikiLinkKey(titulo));
    // Los corchetes del texto romperían el enlace Markdown de destino.
    const limpio = texto.replace(/[[\]]/g, "");
    return id ? `[${limpio}](/wiki/${id})` : `[${limpio}]`;
  });
}

/** Índice título→id para resolver enlaces. Si dos páginas comparten título, gana la primera. */
export function wikiTitleIndex(pages: { id: string; title: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of pages) {
    const k = wikiLinkKey(p.title);
    if (!m.has(k)) m.set(k, p.id);
  }
  return m;
}
