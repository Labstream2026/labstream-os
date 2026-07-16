import { detectSource } from "@/lib/media-source";
import { getGoogleAccessToken } from "@/lib/google-auth";

// Resolución de medios de Google Drive (servidor). Los editores normalmente comparten
// la CARPETA de Drive, no el archivo de video directo. Este helper toma una URL de Drive
// (archivo o carpeta) y resuelve el archivo de medios concreto:
//  - archivo  → devuelve su id directamente.
//  - carpeta  → lee `embeddedfolderview` (público, SIN credenciales) y elige el primer
//               video (o, si no hay, la primera imagen) que contiene.
// Esto permite reproducir el video y CAPTURAR el fotograma (vía el proxy del mismo
// origen) aunque solo se haya pegado el enlace de la carpeta.

// Toleran un sufijo ?query/#hash tras la extensión (igual que media-source.ts): así un nombre de
// archivo dentro de la carpeta con querystring sigue resolviéndose a video/imagen (y por tanto a
// una fuente capturable) en vez de caer al iframe sin captura.
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|mkv|avi)(\?|#|$)/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)(\?|#|$)/i;

export type DriveMedia = { id: string; name: string; isVideo: boolean };

export async function resolveDriveMediaFile(rawUrl: string | null | undefined): Promise<DriveMedia | null> {
  const s = detectSource(rawUrl);
  if (!s) return null;
  if (s.type === "DRIVE_FILE" && s.id) return { id: s.id, name: "", isVideo: true };
  if (s.type !== "DRIVE_FOLDER" || !s.id) return null;

  try {
    const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${s.id}#list`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      // La lista de la carpeta cambia poco; cachéala unos minutos para no golpear Drive
      // en cada render.
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const entries = parseFolderEntries(await res.text());
    const video = entries.find((e) => VIDEO_EXT.test(e.name));
    if (video) return { id: video.id, name: video.name, isVideo: true };
    const image = entries.find((e) => IMAGE_EXT.test(e.name));
    if (image) return { id: image.id, name: image.name, isVideo: false };
    // Sin nombres reconocibles: usa el primer archivo (asumimos video).
    return entries[0] ? { id: entries[0].id, name: entries[0].name, isVideo: true } : null;
  } catch {
    return null;
  }
}

// Extrae {id, name} de cada entrada del HTML de embeddedfolderview. Cada item trae un
// enlace `/file/d/{id}` y un título `flip-entry-title`. Se emparejan por orden.
function parseFolderEntries(html: string): { id: string; name: string }[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/\/file\/d\/([A-Za-z0-9_-]{20,})/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  }
  const names = [...html.matchAll(/flip-entry-title[^>]*>([^<]+)</g)].map((m) => decodeHtml(m[1].trim()));
  return ids.map((id, i) => ({ id, name: names[i] ?? "" }));
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    // Entidades numéricas (hex y decimal): los tokens de confirmación de Drive pueden traer
    // caracteres como '-' o '@' escapados así (&#45;, &#x40;).
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => { const n = parseInt(h, 16); return n <= 0x10ffff ? String.fromCodePoint(n) : m; })
    .replace(/&#(\d+);/g, (m, d) => { const n = parseInt(d, 10); return n <= 0x10ffff ? String.fromCodePoint(n) : m; });
}

// Descarga robusta de un archivo de Drive por su id, devolviendo bytes reproducibles.
// Para archivos GRANDES (masters de varias horas) el endpoint de descarga responde primero
// una página HTML de confirmación (aviso de antivirus «no se pudo analizar») con un token
// `confirm`/`uuid`: la parseamos del formulario y reintentamos la descarga real. `&confirm=t`
// por sí solo NO basta en archivos grandes. Preserva el header Range (seek en videos largos).
const DRIVE_DL = "https://drive.usercontent.google.com/download";
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

// Descarga AUTENTICADA por la API de Drive, si hay cuenta de servicio configurada. Devuelve null
// cuando no la hay o cuando la cuenta no alcanza ese archivo, para que el llamador caiga al camino
// anónimo de siempre. Ventaja sobre el anónimo: el cupo pasa a ser el del proyecto de Google Cloud
// (enorme y compartido) en vez del tope diario POR ARCHIVO de las descargas anónimas —que es lo que
// bloqueaba justo los videos más revisados—. Además la API entrega los bytes directamente: no hay
// interstitial de antivirus que resolver.
async function fetchDriveDownloadAuthed(id: string, range?: string): Promise<Response | null> {
  const token = await getGoogleAccessToken();
  if (!token) return null; // sin credencial configurada (o Google la rechazó): modo anónimo
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (range) headers.Range = range;
  try {
    // acknowledgeAbuse: los masters pesados suelen quedar marcados como "no se pudo analizar";
    // es el equivalente por API a confirmar ese aviso, que el camino anónimo ya hace.
    // supportsAllDrives: los editores a veces trabajan en unidades compartidas.
    const url = `${DRIVE_API}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`;
    const res = await fetch(url, { headers, redirect: "follow" });
    if (res.ok || res.status === 206) return res;
    // 403/404 = el archivo no está compartido con la cuenta de servicio (enlace restringido a
    // personas concretas). El anónimo puede que sí llegue si es "cualquiera con el enlace", así
    // que se cede el turno en vez de fallar. Se descarta el cuerpo para no dejar la conexión viva.
    await res.body?.cancel().catch(() => {});
    return null;
  } catch {
    return null;
  }
}

export async function fetchDriveDownload(id: string, range?: string): Promise<Response> {
  const authed = await fetchDriveDownloadAuthed(id, range);
  if (authed) return authed;
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
  if (range) headers.Range = range;
  const first = await fetch(`${DRIVE_DL}?id=${encodeURIComponent(id)}&export=download`, { headers, redirect: "follow" });
  const ctype = first.headers.get("content-type") || "";
  if (!ctype.includes("text/html")) return first; // ya son bytes (206/200)
  // Página de confirmación → arma el querystring real del formulario y reintenta.
  const qs = parseConfirmForm(await first.text(), id);
  if (!qs) return first; // sin token reconocible: el llamador devolverá 502
  return fetch(`${DRIVE_DL}?${qs}`, { headers, redirect: "follow" });
}

// Extrae los inputs ocultos del formulario de confirmación de Drive (id, export, confirm,
// uuid, at…) y arma el querystring de la descarga real. Se acota al <form id="download-form">
// para no capturar inputs ajenos; respaldo: busca confirm/uuid sueltos en el HTML.
function parseConfirmForm(html: string, id: string): string | null {
  const form = html.match(/<form[^>]*\bid="download-form"[^>]*>([\s\S]*?)<\/form>/i);
  const scope = form ? form[1] : html;
  const p = new URLSearchParams();
  for (const tag of scope.match(/<input\b[^>]*>/gi) ?? []) {
    const name = tag.match(/\bname="([^"]*)"/i)?.[1];
    if (!name) continue;
    p.set(name, decodeHtml(tag.match(/\bvalue="([^"]*)"/i)?.[1] ?? ""));
  }
  // El token `confirm` es el crítico. Si el formulario NO lo trae como input (aunque traiga
  // otros: uuid, at, export…), búscalo suelto en el HTML. Guardar solo por «form sin inputs»
  // dejaba pasar descargas sin confirm → HTML de nuevo → 502.
  if (!p.has("confirm")) {
    const confirm = html.match(/[?&]confirm=([\w-]+)/)?.[1];
    if (confirm) {
      p.set("confirm", confirm);
      if (!p.has("uuid")) {
        const uuid = html.match(/[?&]uuid=([\w-]+)/)?.[1];
        if (uuid) p.set("uuid", uuid);
      }
    }
  }
  if (![...p.keys()].length) return null; // nada aprovechable
  if (!p.has("id")) p.set("id", id);
  if (!p.has("export")) p.set("export", "download");
  return p.toString();
}

// Adivina el tipo MIME reproducible a partir del nombre de archivo (para servir por el proxy).
export function guessDriveMime(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".webm")) return "video/webm";
  if (n.endsWith(".ogg") || n.endsWith(".ogv")) return "video/ogg";
  if (n.endsWith(".mov")) return "video/quicktime";
  if (n.endsWith(".m4v")) return "video/x-m4v";
  if (n.endsWith(".mkv")) return "video/x-matroska";
  if (n.endsWith(".avi")) return "video/x-msvideo";
  if (/\.jpe?g$/.test(n)) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  return "video/mp4";
}
