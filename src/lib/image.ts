import sharp from "sharp";
import { saveBuffer, writeRelBuffer } from "@/lib/storage";

// Ajuste de MEMORIA para el NAS. Por defecto sharp (libvips) usa un hilo por núcleo y mantiene
// una caché en RAM; con varias subidas a la vez (o una foto grande/HEIC) el pico de RSS se
// dispara y el kernel puede matar el proceso Node por OOM → el contenedor «se detiene
// inesperadamente» y `restart: unless-stopped` lo revive, repitiéndose. Serializamos el trabajo
// de libvips y apagamos su caché: procesar imágenes va un pelín más lento, pero el pico queda
// acotado. La memoria de sharp es NATIVA (fuera del heap de V8), por eso --max-old-space-size NO
// la limita y hay que acotarla aquí. Idempotente: sharp es un singleton nativo por proceso.
sharp.concurrency(1);
sharp.cache(false);

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
// Opciones de optimización. `crop` recorta a un tamaño EXACTO (fit cover, enfoque
// inteligente) — ideal para portadas/banners, que se muestran a una proporción fija;
// si no, se redimensiona conservando proporción (lado largo ≤ maxEdge).
export type OptimizeOpts = { maxEdge?: number; quality?: number; crop?: { width: number; height: number } };

export async function optimizeToWebp(buf: Buffer, opts?: OptimizeOpts): Promise<Buffer | null> {
  try {
    const pipeline = sharp(buf, { failOn: "none", animated: !opts?.crop }).rotate();
    if (opts?.crop) {
      pipeline.resize({ width: opts.crop.width, height: opts.crop.height, fit: "cover", position: "attention" });
    } else {
      pipeline.resize({ width: opts?.maxEdge ?? MAX_EDGE, height: opts?.maxEdge ?? MAX_EDGE, fit: "inside", withoutEnlargement: true });
    }
    return await pipeline.webp({ quality: opts?.quality ?? WEBP_QUALITY }).toBuffer();
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
  opts?: OptimizeOpts,
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
  opts?: OptimizeOpts,
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
  opts?: OptimizeOpts,
): Promise<string> {
  if (isOptimizableImage(filename, mime)) {
    const webp = await optimizeToWebp(buf, opts);
    if (webp) return saveBuffer(relDir, filename, webp);
  }
  return saveBuffer(relDir, filename, buf);
}

const BANNER_EDGE = 1600; // ancho/alto máx. para portadas (banner ancho de cabecera)
export const IMAGE_EDGES = { MAX_EDGE, AVATAR_EDGE, BANNER_EDGE };
