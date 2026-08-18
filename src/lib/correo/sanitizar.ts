import sanitizeHtml from "sanitize-html";

// ── Saneado del HTML de un correo ───────────────────────────────────────────
// El HTML de un correo entrante es ENTRADA HOSTIL: viene de cualquiera en internet y se va a
// pintar dentro de la sesión de alguien del equipo. Aquí se decide qué sobrevive. Además del
// saneado, la página lo encierra en un <iframe sandbox> — dos vallas, no una.
//
// Las imágenes remotas van BLOQUEADAS por defecto y no es (solo) por estética: un <img> a un
// servidor ajeno es una baliza — le confirma al remitente que el correo se abrió, cuándo y
// desde qué IP. Se quitan contando cuántas eran, y la página ofrece «Mostrar imágenes» para
// verlas a propósito. Las incrustadas (cid:) no se resuelven en esta versión: fuera también.

export type HtmlSaneado = {
  html: string;
  /** Imágenes remotas retiradas (0 cuando se permiten o no había). */
  imagenesBloqueadas: number;
};

const TAGS = [
  "a", "b", "i", "em", "strong", "u", "s", "p", "br", "hr", "div", "span", "blockquote", "pre", "code",
  "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "small", "sub", "sup", "center", "font",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "img",
];

// Estilos en línea que un correo usa de verdad para verse bien. Nada de position/z-index (se
// saldría del marco) ni url(...) (otra baliza por CSS).
const ESTILOS: Record<string, RegExp[]> = {
  color: [/^[#a-z0-9(),.\s%]+$/i],
  "background-color": [/^[#a-z0-9(),.\s%]+$/i],
  "font-size": [/^[\d.]+(px|pt|em|rem|%)$/],
  "font-weight": [/^(bold|normal|[1-9]00)$/],
  "font-style": [/^(italic|normal)$/],
  "font-family": [/^[\w\s,'"–-]+$/],
  "text-align": [/^(left|right|center|justify)$/],
  "text-decoration": [/^[a-z\s-]+$/],
  "line-height": [/^[\d.]+(px|pt|em|rem|%)?$/],
  width: [/^[\d.]+(px|em|rem|%)$/],
  "max-width": [/^[\d.]+(px|em|rem|%)$/],
  height: [/^[\d.]+(px|em|rem|%)$/],
  margin: [/^[\d.\s]+(px|em|rem|%|auto)?[\d.\spxemrem%auto]*$/],
  padding: [/^[\d.\s]+(px|em|rem|%)?[\d.\spxemrem%]*$/],
  border: [/^[\w\s#.]+$/],
  "border-radius": [/^[\d.\s]+(px|em|rem|%)$/],
  display: [/^(block|inline|inline-block|none)$/],
};

export function sanearCorreo(htmlCrudo: string, opts?: { permitirImagenes?: boolean }): HtmlSaneado {
  const permitir = opts?.permitirImagenes === true;
  let bloqueadas = 0;

  const html = sanitizeHtml(htmlCrudo, {
    allowedTags: TAGS,
    allowedAttributes: {
      // target/rel van aquí porque los PONE la transformación de abajo: lo que la lista no
      // permite se recorta DESPUÉS de transformar, y sin ellos el _blank moría en silencio.
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      td: ["colspan", "rowspan", "align", "valign"],
      th: ["colspan", "rowspan", "align", "valign"],
      table: ["width", "cellpadding", "cellspacing", "align", "border"],
      font: ["color", "size", "face"],
      "*": ["style"],
    },
    allowedStyles: { "*": ESTILOS },
    // mailto incluido: «escríbenos a…» es legítimo en un correo. javascript: muere aquí.
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: permitir ? ["http", "https"] : [] },
    transformTags: {
      // Todo enlace abre fuera y sin darle al destino una ventana que manipular.
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
    exclusiveFilter: (frame) => {
      if (frame.tag !== "img") return false;
      const src = String(frame.attribs?.src ?? "");
      // Las cid: (incrustadas) no se resuelven en esta versión; las remotas solo si se pidió.
      const viva = permitir && /^https?:\/\//i.test(src);
      if (!viva) bloqueadas += 1;
      return !viva;
    },
  });

  return { html, imagenesBloqueadas: bloqueadas };
}

/** Texto plano de un HTML, para el snippet de la bandeja. */
export function textoPlano(html: string, max = 180): string {
  // Un espacio antes de cada etiqueta: al quitarlas, «</p><p>» no pega dos frases. El colapso
  // de espacios de abajo se lleva los sobrantes.
  const t = sanitizeHtml(html.replace(/</g, " <"), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
