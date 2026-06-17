import { detectSource } from "@/lib/media-source";

// Resolución de medios de Google Drive (servidor). Los editores normalmente comparten
// la CARPETA de Drive, no el archivo de video directo. Este helper toma una URL de Drive
// (archivo o carpeta) y resuelve el archivo de medios concreto:
//  - archivo  → devuelve su id directamente.
//  - carpeta  → lee `embeddedfolderview` (público, SIN credenciales) y elige el primer
//               video (o, si no hay, la primera imagen) que contiene.
// Esto permite reproducir el video y CAPTURAR el fotograma (vía el proxy del mismo
// origen) aunque solo se haya pegado el enlace de la carpeta.

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg|mkv|avi)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;

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
    .replace(/&quot;/g, '"');
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
