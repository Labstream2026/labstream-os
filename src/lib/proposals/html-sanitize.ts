import sanitizeHtml from "sanitize-html";

// ── Saneo del HTML de los bloques de propuesta (SOLO servidor) ──
// El body de un bloque `text` se renderiza en el portal PÚBLICO del cliente con
// dangerouslySetInnerHTML. Este módulo usa sanitize-html (dependencia de Node) con una
// allowlist real, así que SOLO debe importarse desde componentes/rutas de servidor —
// nunca desde el editor (cliente), para no arrastrar sanitize-html al bundle del navegador.
// La misma allowlist se aplica AL GUARDAR (sanitizeBlocks en las server actions) y AQUÍ al
// renderizar la vista pública, para cubrir también propuestas guardadas antes de esa defensa.
export const PROPOSAL_HTML_OPTS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "blockquote", "span"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }) },
};

// Sanea in-place el campo `body` (HTML) de cada bloque y devuelve la misma lista.
export function sanitizeBlockBodies<T>(blocks: T[]): T[] {
  for (const b of blocks) {
    const rec = b as unknown as Record<string, unknown>;
    if (typeof rec.body === "string") rec.body = sanitizeHtml(rec.body, PROPOSAL_HTML_OPTS);
  }
  return blocks;
}
