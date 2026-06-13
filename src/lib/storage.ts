import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// Storage local (en el NAS es el bind mount ./data/storage → /app/storage).
export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");

function secret() {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "dev-secret-cambiar";
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
  // evita path traversal
  const full = path.join(STORAGE_DIR, rel);
  if (!full.startsWith(STORAGE_DIR)) throw new Error("ruta inválida");
  return full;
}

export async function readBuffer(rel: string) {
  return fs.readFile(absPath(rel));
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
  return crypto.timingSafeEqual(Buffer.from(sig || ""), Buffer.from(expected));
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
};

export function extOf(name: string) {
  return (name.split(".").pop() || "").toLowerCase();
}

export function mimeFor(name: string, fallback?: string | null) {
  return MIME[extOf(name)] || fallback || "application/octet-stream";
}
