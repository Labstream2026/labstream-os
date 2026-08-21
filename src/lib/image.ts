import sharp from "sharp";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { saveBuffer, writeRelBuffer } from "@/lib/storage";

// ── Respaldo de decodificación con FFmpeg (máxima compatibilidad) ──────────────
// El binario prebuilt de sharp (libvips) del NAS decodifica pocos formatos: NO HEIC/HEVC (el
// formato POR DEFECTO del iPhone, quitado por licencias), y falla con TIFF raros, BMP exóticos y
// muchos RAW de cámara. FFmpeg —que YA está en la imagen (Dockerfile) y trae un montón de
// decodificadores— hace de puente: cuando sharp NO puede, se decodifica el original a JPEG con
// FFmpeg y sharp termina el WebP. Así «casi todo lo que se pueda abrir» se ve en la galería. El
// demuxer necesita entrada SEEKABLE (HEIF, RAW), por eso va por archivo temporal y no por stdin.
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const FFMPEG_MS = 25_000;

// Decodifica CUALQUIER imagen que FFmpeg entienda a un JPEG. Devuelve null si no pudo (FFmpeg
// ausente, formato que ni FFmpeg abre —algún RAW propietario—, timeout). Escribe un temporal
// (FFmpeg lee de archivo), saca el primer/único fotograma a stdout como MJPEG.
async function ffmpegAJpeg(buf: Buffer): Promise<Buffer | null> {
  const tmp = path.join(tmpdir(), `ls-img-${crypto.randomUUID()}`);
  try {
    await fs.writeFile(tmp, buf);
  } catch {
    return null;
  }
  try {
    return await new Promise<Buffer | null>((resolve) => {
      const p = spawn(
        FFMPEG,
        ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", tmp, "-an", "-sn", "-dn", "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg", "-q:v", "2", "pipe:1"],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      const trozos: Buffer[] = [];
      let cerrado = false;
      const corte = setTimeout(() => {
        cerrado = true;
        p.kill("SIGKILL");
        resolve(null);
      }, FFMPEG_MS);
      p.stdout.on("data", (d: Buffer) => trozos.push(d));
      p.on("error", () => {
        clearTimeout(corte);
        if (!cerrado) {
          cerrado = true;
          resolve(null);
        }
      });
      p.on("close", () => {
        clearTimeout(corte);
        if (cerrado) return;
        cerrado = true;
        const out = Buffer.concat(trozos);
        resolve(out.length > 0 ? out : null);
      });
    });
  } finally {
    await fs.unlink(tmp).catch(() => {});
  }
}

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

// Rasterizables que sharp O FFmpeg pueden abrir. Incluye RAW de cámara (Canon 5Ds CR2/CR3, Nikon
// NEF, Sony ARW, Adobe DNG, Fuji RAF, Olympus ORF, Panasonic RW2, Pentax PEF…): sharp no los abre,
// pero FFmpeg decodifica muchos; los que ni FFmpeg pueda quedan SIN miniatura pero SÍ descargables.
const RASTER_RE = /\.(jpe?g|png|webp|gif|tiff?|avif|heic|heif|bmp|cr2|cr3|nef|nrw|arw|sr2|srf|dng|raf|orf|rw2|pef|srw|3fr|dcr|mrw)$/i;
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

async function webpDeBuffer(buf: Buffer, opts?: OptimizeOpts): Promise<Buffer> {
  const pipeline = sharp(buf, { failOn: "none", animated: !opts?.crop }).rotate();
  if (opts?.crop) {
    pipeline.resize({ width: opts.crop.width, height: opts.crop.height, fit: "cover", position: "attention" });
  } else {
    pipeline.resize({ width: opts?.maxEdge ?? MAX_EDGE, height: opts?.maxEdge ?? MAX_EDGE, fit: "inside", withoutEnlargement: true });
  }
  return pipeline.webp({ quality: opts?.quality ?? WEBP_QUALITY }).toBuffer();
}

export async function optimizeToWebp(buf: Buffer, opts?: OptimizeOpts): Promise<Buffer | null> {
  try {
    return await webpDeBuffer(buf, opts);
  } catch {
    // sharp no pudo (HEIC del iPhone, TIFF/BMP raro, RAW de cámara…). Se intenta decodificar con
    // FFmpeg y, si sale un JPEG, sharp termina el WebP. Si FFmpeg tampoco puede, null (el llamador
    // conserva el original y la miniatura cae a un marcador; nunca se sirve el original pesado).
    const jpeg = await ffmpegAJpeg(buf);
    if (jpeg) {
      try {
        return await webpDeBuffer(jpeg, opts);
      } catch {
        return null;
      }
    }
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
