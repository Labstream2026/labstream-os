import sanitizeHtml from "sanitize-html";

// ── El HTML que ESCRIBE el equipo (redactor con formato) ────────────────────
// Allowlist CORTA a propósito: lo que el redactor puede producir (negrita, cursiva, listas,
// enlaces, imágenes) y nada más. Aunque el HTML nace en nuestra propia UI, al servidor llega
// del navegador — se sanea como si fuera hostil, siempre.
//
// Las imágenes del cuerpo NO viajan como URLs: se convierten a partes INCRUSTADAS (CID) del
// mensaje. Un correo con `data:` gigantes en el HTML lo recortan varios clientes, y una URL
// remota es una imagen que Gmail esconde tras «mostrar imágenes». CID se ve siempre y los
// GIFs animados se mueven de verdad en la bandeja del cliente.

export type ParteInline = { cid: string; nombre: string; mime: string; contenido: Buffer };

const TAGS_SALIENTE = ["a", "b", "i", "em", "strong", "u", "s", "p", "br", "div", "span", "ul", "ol", "li", "blockquote", "img", "hr", "h2", "h3", "table", "tbody", "tr", "td"];

// Colores que el redactor puede usar (paleta corta y sobria — la del estudio). Un correo
// «óptimo» no es un arcoíris: se acota aquí y la barra solo ofrece estos.
export const PALETA_CORREO = ["#18181b", "#71717a", "#0369a1", "#047857", "#b45309", "#be123c"] as const;

export function sanearSaliente(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: TAGS_SALIENTE,
    allowedAttributes: {
      a: ["href", "target", "rel", "style"],
      img: ["src", "alt", "width", "height", "style"],
      table: ["width", "cellpadding", "cellspacing", "role", "style"],
      td: ["style"],
      "*": ["style"],
    },
    allowedStyles: {
      "*": {
        // Formato de texto + los estilos EN LÍNEA de los bloques (botón, caja, tarjeta):
        // en correo no hay hoja de estilos — todo viaja pegado al elemento.
        "font-weight": [/^(bold|normal|[1-9]00)$/],
        "font-style": [/^(italic|normal)$/],
        "font-size": [/^[\d.]+(px|em)$/],
        "text-decoration": [/^[a-z\s-]+$/],
        "text-align": [/^(left|center|right)$/],
        color: [/^#[0-9a-f]{3,8}$/i],
        "background-color": [/^#[0-9a-f]{3,8}$/i],
        background: [/^#[0-9a-f]{3,8}$/i],
        width: [/^[\d.]+(px|%)$/],
        "max-width": [/^[\d.]+(px|%)$/],
        height: [/^auto$|^[\d.]+(px|%)$/],
        padding: [/^[\d.\s]+(px)?[\d.\spx]*$/],
        margin: [/^[\d.\s]+(px|auto)?[\d.\spxauto]*$/],
        border: [/^[\w\s#]+$/],
        "border-left": [/^[\w\s#]+$/],
        "border-radius": [/^[\d.]+px$/],
        "border-collapse": [/^(separate|collapse)$/],
        display: [/^(block|inline-block)$/],
        "line-height": [/^[\d.]+(px|em)?$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    // data: solo en <img> y solo imágenes: es el vehículo del redactor hacia el CID.
    allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener" }),
    },
  });
}

const MAX_INLINES = 20;
const MAX_INLINE_BYTES = 8 * 1024 * 1024; // 8 MB de imágenes dentro del cuerpo ya es un poster

/**
 * Convierte las imágenes del cuerpo en partes CID:
 *   · `data:image/...;base64,...` (pegadas o insertadas en el redactor) → bytes propios
 *   · `/api/correo/gif/<id>` (la biblioteca del estudio) → las resuelve `cargarGif`
 * Devuelve el HTML reescrito (src="cid:...") y la lista de partes para el MailComposer.
 */
export async function extraerInlines(
  html: string,
  cargarGif: (id: string) => Promise<{ nombre: string; mime: string; contenido: Buffer } | null>,
): Promise<{ html: string; inlines: ParteInline[]; error?: string }> {
  const inlines: ParteInline[] = [];
  let total = 0;
  let n = 0;
  let error: string | undefined;

  // src entre comillas dobles o simples; el DOM del redactor siempre serializa con dobles,
  // las simples cubren HTML pegado de otra parte.
  const RE_SRC = /(<img\b[^>]*?\bsrc=)("([^"]*)"|'([^']*)')/gi;
  const trozos: { desde: number; hasta: number; reemplazo: string }[] = [];

  for (const m of html.matchAll(RE_SRC)) {
    const src = m[3] ?? m[4] ?? "";
    let parte: ParteInline | null = null;

    const dataUri = /^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/i.exec(src);
    const gifRef = /^\/api\/correo\/gif\/([a-z0-9]+)$/i.exec(src);
    if (dataUri) {
      const contenido = Buffer.from(dataUri[2], "base64");
      n += 1;
      parte = { cid: `inl${n}@labstream`, nombre: `imagen-${n}.${dataUri[1].split("/")[1].replace("jpeg", "jpg")}`, mime: dataUri[1].toLowerCase(), contenido };
    } else if (gifRef) {
      const gif = await cargarGif(gifRef[1]);
      if (gif) {
        n += 1;
        parte = { cid: `inl${n}@labstream`, ...gif };
      }
    }
    if (!parte) continue;

    total += parte.contenido.length;
    if (inlines.length >= MAX_INLINES || total > MAX_INLINE_BYTES) {
      error = "El cuerpo lleva demasiadas imágenes (máx. 20 y 8 MB). Quita alguna o mándala como adjunto.";
      break;
    }
    inlines.push(parte);
    trozos.push({ desde: m.index! + m[1].length, hasta: m.index! + m[0].length, reemplazo: `"cid:${parte.cid}"` });
  }
  if (error) return { html, inlines: [], error };

  // Reescritura de atrás hacia adelante para no invalidar los índices.
  let out = html;
  for (const t of [...trozos].reverse()) out = out.slice(0, t.desde) + t.reemplazo + out.slice(t.hasta);
  return { html: out, inlines };
}

/**
 * La FIRMA como bloque HTML + su imagen como parte CID. Sin firma personalizada se usa la
 * institucional (nombre + cargo + Labstream). La imagen viaja incrustada con `width` a la
 * MITAD de sus píxeles vía atributo del editor — el usuario la sube a 2× y se ve nítida en
 * pantallas retina sin recomprimir nada.
 */
export function bloqueFirma(opts: {
  nombre: string;
  cargo?: string | null;
  firmaHtml?: string | null;
  tieneImagen?: boolean;
}): { html: string; cidImagen: string | null } {
  const cidImagen = opts.tieneImagen ? "firma@labstream" : null;
  const cuerpo = opts.firmaHtml?.trim()
    ? sanearSaliente(opts.firmaHtml)
    : `<p style="margin:0"><b>${esc(opts.nombre)}</b>${opts.cargo ? ` · ${esc(opts.cargo)}` : ""}<br>Labstream Studio · <a href="https://labstreamsas.com" target="_blank" rel="noopener">labstreamsas.com</a></p>`;
  const img = cidImagen ? `<p style="margin:8px 0 0"><img src="cid:${cidImagen}" alt="" style="max-width:220px"></p>` : "";
  return { html: `<div style="margin-top:16px">—<br>${cuerpo}${img}</div>`, cidImagen };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Texto plano paralelo al HTML (la parte text/plain del multipart), con sus saltos. */
export function textoDeHtml(html: string): string {
  const conSaltos = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|blockquote)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n· ")
    .replace(/<img\b[^>]*>/gi, ""); // una imagen no tiene texto que decir
  const plano = sanitizeHtml(conSaltos, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return plano.slice(0, 100_000);
}

/** Un fragmento de TEXTO plano del usuario, como HTML seguro con sus saltos. */
export function htmlDeTexto(texto: string): string {
  return esc(texto).replace(/\n/g, "<br>");
}
