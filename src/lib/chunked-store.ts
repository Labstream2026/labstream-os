import fs from "node:fs/promises";
import path from "node:path";
import { STORAGE_DIR } from "@/lib/storage";

// Almacén de la subida por TROZOS: metadatos + archivo parcial en STORAGE_DIR/chunked.
// (Vive fuera de las rutas porque un route.ts de Next solo puede exportar métodos HTTP.)

export const CHUNK_DIR = path.join(STORAGE_DIR, "chunked");
export const MAX_TOTAL = 8 * 1024 * 1024 * 1024; // 8 GB por archivo — techo generoso para masters
export const BLOCKED_UPLOAD_EXT = /\.(exe|msi|bat|cmd|com|scr|ps1|sh|php|jar|apk)$/i;

export type ChunkMeta = {
  id: string;
  fileName: string;
  size: number;
  mime: string;
  projectId: string;
  userId: string;
  createdAt: string;
};

export function metaPath(id: string) {
  return path.join(CHUNK_DIR, `${id}.meta.json`);
}
export function partPath(id: string) {
  return path.join(CHUNK_DIR, `${id}.part`);
}
export function validChunkId(id: string) {
  return /^[a-f0-9-]{36}$/.test(id);
}
export async function readChunkMeta(id: string): Promise<ChunkMeta | null> {
  if (!validChunkId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(metaPath(id), "utf8")) as ChunkMeta;
  } catch {
    return null;
  }
}
export async function removeChunkUpload(id: string) {
  await fs.rm(partPath(id), { force: true }).catch(() => {});
  await fs.rm(metaPath(id), { force: true }).catch(() => {});
}

// Basura de subidas abandonadas: se barre oportunistamente en cada init (sin cron nuevo).
export async function sweepStaleChunks() {
  try {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    for (const f of await fs.readdir(CHUNK_DIR)) {
      const p = path.join(CHUNK_DIR, f);
      const st = await fs.stat(p).catch(() => null);
      if (st && st.mtimeMs < cutoff) await fs.rm(p, { force: true }).catch(() => {});
    }
  } catch {
    /* mejor esfuerzo */
  }
}

// Serializa las operaciones por subida (dos PUT simultáneos del mismo id se encolan).
const locks = new Map<string, Promise<unknown>>();
export async function withChunkLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const chained = next.catch(() => {});
  locks.set(id, chained);
  try {
    return await next;
  } finally {
    if (locks.get(id) === chained) locks.delete(id);
  }
}
