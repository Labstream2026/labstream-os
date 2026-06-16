// Saneado básico del HTML del bloque «texto» de una propuesta (se renderiza con
// dangerouslySetInnerHTML en el portal PÚBLICO del cliente). El editor son personas
// del equipo (de confianza), pero esto evita XSS almacenado: quita scripts, manejadores
// de eventos y URLs peligrosas. Pensado para HTML simple (strong/em/p/br/ul/li/a).

const DANGEROUS = "script|style|iframe|object|embed|link|meta|base|form|svg|math";

export function sanitizeProposalHtml(html: string): string {
  if (!html) return "";
  let s = html;
  // Tags peligrosos con su contenido (p. ej. <script>…</script>).
  s = s.replace(new RegExp(`<\\s*(${DANGEROUS})\\b[\\s\\S]*?<\\s*/\\s*\\1\\s*>`, "gi"), "");
  // Tags peligrosos huérfanos o auto-cerrados.
  s = s.replace(new RegExp(`<\\s*/?\\s*(${DANGEROUS})\\b[^>]*>`, "gi"), "");
  // Manejadores de eventos inline: on*="…".
  s = s.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Neutraliza javascript:/data: en href/src.
  s = s.replace(/(href|src)\s*=\s*(?:"\s*(?:javascript|data):[^"]*"|'\s*(?:javascript|data):[^']*'|(?:javascript|data):[^\s>]+)/gi, '$1="#"');
  return s;
}
