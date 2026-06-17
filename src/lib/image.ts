import sharp from "sharp";
import { saveBuffer, writeRelBuffer } from "@/lib/storage";

// Optimización de imágenes al subir. Guardamos SIEMPRE el original (descarga a
// resolución completa) y, si es una imagen rasterizable, un derivado WebP ligero
// para previsualizar: lado largo ≤ MAX_EDGE, conserva la relación de aspecto y
// respeta la orientación EXIF. El derivado vive como hermano «<ruta>.opt.webp».

const MAX_EDGE = 1920; // lado largo máx. para fotos de chat/proyecto/tablas
const AVATAR_EDGE = 512; // los avatares se muestran pequeños
const WEBP_QUALITY = 80;

// Sufijo del derivado optimizado (hermano del original en el storage).
export const OPT_SUFFIX = ".opt.webp";

// Ruta del derivado optimizado a partir de la ruta del original.
export function previewRel(rel: string) {
  return rel + OPT_SUFFIX;
}

const RASTER_RE = /\.(jpe?g|png|webp|gif|tiff?|avif|heic|heif|bmp)$/i;
const RASTER_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/bmp",
]);

// ¿Es una imagen rasterizable que sharp puede redimensionar/convertir? El SVG se
// excluye (es vectorial; no tiene sentido rasterizarlo) y se sirve tal cual.
export function isOptimizableImage(name: string, mime?: string | null): boolean {
  if (/\.svg$/i.test(name) || (mime ?? "").toLowerCase() === "image/svg+xml") return false;
  return RASTER_RE.test(name) || RASTER_MIME.has((mime ?? "").toLowerCase());
}

// Devuelve un WebP redimensionado (lado largo ≤ maxEdge, conserva proporción,
// respeta EXIF). Devuelve null si no se pudo procesar (p. ej. archivo corrupto o
// HEIC sin soporte libheif) → el llamador conserva solo el original.
export async function optimizeToWebp(
  buf: Buffer,
  opts?: { maxEdge?: number; quality?: number },
): Promise<Buffer | null> {
  try {
    return await sharp(buf, { failOn: "none", animated: true })
      .rotate()
      .resize({
        width: opts?.maxEdge ?? MAX_EDGE,
        height: opts?.maxEdge ?? MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: opts?.quality ?? WEBP_QUALITY })
      .toBuffer();
  } catch {
    return null;
  }
}

// Guarda el original con saveBuffer y, si es imagen, intenta crear el derivado
// WebP en «<rel>.opt.webp». Devuelve la ruta del original (lo que se guarda en BD).
export async function saveBufferWithPreview(
  relDir: string,
  filename: string,
  buf: Buffer,
  mime?: string | null,
  opts?: { maxEdge?: number; quality?: number },
): Promise<string> {
  const rel = await saveBuffer(relDir, filename, buf);
  if (isOptimizableImage(filename, mime)) {
    const webp = await optimizeToWebp(buf, opts);
    if (webp) await writeRelBuffer(previewRel(rel), webp);
  }
  return rel;
}

// Variante para rutas de tamaño fijo (avatar, celda de tabla) donde el `rel` ya
// se conoce: escribe original + derivado en rutas exactas. Devuelve `rel`.
export async function saveImageAtRel(
  rel: string,
  buf: Buffer,
  mime?: string | null,
  opts?: { maxEdge?: number; quality?: number },
): Promise<string> {
  await writeRelBuffer(rel, buf);
  if (isOptimizableImage(rel, mime)) {
    const webp = await optimizeToWebp(buf, opts);
    if (webp) await writeRelBuffer(previewRel(rel), webp);
  }
  return rel;
}

// Guarda SOLO la versión optimizada (WebP redimensionado) — sin conservar el original
// a resolución completa. Para imágenes DECORATIVAS (portadas/banners de cliente o
// proyecto) donde nunca se descarga el original: ahorra disco y mantiene el archivo
// ligero. Si la imagen no se puede optimizar (corrupta/no rasterizable), guarda el
// original como respaldo. Devuelve la ruta guardada.
export async function saveOptimizedImage(
  relDir: string,
  filename: string,
  buf: Buffer,
  mime?: string | null,
  opts?: { maxEdge?: number; quality?: number },
): Promise<string> {
  if (isOptimizableImage(filename, mime)) {
    const webp = await optimizeToWebp(buf, opts);
    if (webp) return saveBuffer(relDir, filename, webp);
  }
  return saveBuffer(relDir, filename, buf);
}

const BANNER_EDGE = 1600; // ancho/alto máx. para portadas (banner ancho de cabecera)
export const IMAGE_EDGES = { MAX_EDGE, AVATAR_EDGE, BANNER_EDGE };
