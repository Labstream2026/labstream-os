import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { appSecret } from "@/lib/app-secret";

// Storage local (en el NAS es el bind mount ./data/storage → /app/storage).
export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");

function secret() {
  return appSecret();
}

export function sanitizeName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 200);
}

export async function saveBuffer(relDir: string, filename: string, buf: Buffer) {
  const dir = path.join(STORAGE_DIR, relDir);
  await fs.mkdir(dir, { recursive: true });
  const rel = path.posix.join(relDir, sanitizeName(filename));
  await fs.writeFile(path.join(STORAGE_DIR, rel), buf);
  return rel;
}

export function absPath(rel: string) {
  // evita path traversal (compara por límite de ruta, no por prefijo de string)
  const full = path.resolve(STORAGE_DIR, rel);
  const root = path.resolve(STORAGE_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("ruta inválida");
  return full;
}

export async function readBuffer(rel: string) {
  return fs.readFile(absPath(rel));
}

// Borra un archivo del storage (best-effort: si no existe, no falla). Valida traversal.
export async function deleteRel(rel: string): Promise<void> {
  try {
    await fs.unlink(absPath(rel));
  } catch {
    /* no existe o ya borrado: nada que hacer */
  }
}

// Escribe un buffer en una ruta relativa EXACTA (ya resuelta, p. ej. el hermano
// «.opt.webp» de un original). Crea la carpeta si hace falta. Valida traversal.
export async function writeRelBuffer(rel: string, buf: Buffer) {
  const full = absPath(rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf);
  return rel;
}

// Token HMAC para que el Document Server (sin cookie) pueda leer/guardar un adjunto.
export function signFileToken(attachmentId: string, ttlSeconds = 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const data = `${attachmentId}.${exp}`;
  const sig = crypto.createHmac("sha256", secret()).update(data).digest("base64url");
  return `${exp}.${sig}`;
}

export function verifyFileToken(attachmentId: string, token: string | null) {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto
    .createHmac("sha256", secret())
    .update(`${attachmentId}.${exp}`)
    .digest("base64url");
  const a = Buffer.from(sig || "");
  const b = Buffer.from(expected);
  // timingSafeEqual lanza si difieren en longitud → comparar largo primero (evita 500).
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  txt: "text/plain",
  csv: "text/csv",
  // Audio (notas de voz y adjuntos de audio).
  weba: "audio/webm",
  webm: "audio/webm",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  // Video (masters subidos al NAS para revisión). Sin esto mimeFor devolvía octet-stream y el
  // <video> no reproducía → no se podía capturar el fotograma ni leer el segundo.
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  ogv: "video/ogg",
};

export function extOf(name: string) {
  return (name.split(".").pop() || "").toLowerCase();
}

export function mimeFor(name: string, fallback?: string | null) {
  return MIME[extOf(name)] || fallback || "application/octet-stream";
}

// Tipos seguros para servir EN LÍNEA (inline). Cualquier otro tipo (incl. SVG y
// text/html, que el navegador ejecuta) se fuerza a descarga con octet-stream para
// evitar XSS almacenado vía Content-Type controlado por el cliente.
const INLINE_SAFE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "application/pdf",
  // Audio: seguro de servir en línea (no ejecuta como SVG/HTML) → notas de voz reproducibles.
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  // Video: seguro de servir en línea (no ejecuta como SVG/HTML). NECESARIO para que el <video>
  // del reproductor de revisión reproduzca los masters del NAS (si no, se sirven como octet-stream
  // y no se pueden reproducir ni, por tanto, capturar el fotograma).
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-m4v",
  "video/x-matroska",
]);

export function isInlineSafeMime(mime: string): boolean {
  return INLINE_SAFE_MIME.has(mime);
}
