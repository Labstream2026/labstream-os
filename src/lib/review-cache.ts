import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { db } from "@/lib/db";
import { STORAGE_DIR } from "@/lib/storage";
import { fetchDriveDownload, guessDriveMime } from "@/lib/drive";

// Caché local (NAS) del video de revisión de Drive.
//
// Por qué existe: el proxy /api/review-media descargaba el archivo de Drive en CADA visita y
// CADA salto de la barra de tiempo. Google limita las descargas ANÓNIMAS por archivo/día y
// acababa respondiendo "Quota exceeded" (502) en los videos que el equipo más revisa; entonces
// el <video> no cargaba → el segundo se quedaba en 0 y la captura del fotograma salía en negro.
// Con esta caché, Drive se toca UNA sola vez por versión: la primera apertura baja el archivo al
// NAS y de ahí en adelante todo se sirve desde disco (rápido, con Range) sin volver a gastar cupo.

const CACHE_DIR = path.join(STORAGE_DIR, "review-cache");
const MAX_TOTAL_BYTES = 20 * 1024 * 1024 * 1024; // 20 GB: tope del caché (LRU por último acceso)
const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024; // un único archivo > 4 GB no se cachea (se proxia en vivo)

// Descargas en curso (un solo contenedor Node) para no bajar el mismo archivo dos veces a la vez.
const inFlight = new Set<string>();

const binPath = (versionId: string) => path.join(CACHE_DIR, `${versionId}.bin`);
const metaPath = (versionId: string) => path.join(CACHE_DIR, `${versionId}.json`);
const partPath = (versionId: string) => path.join(CACHE_DIR, `${versionId}.part`);

export type CachedReview = { path: string; size: number; mime: string };

// Devuelve la caché SOLO si está completa (existe el .bin no vacío y su meta .json). null si no.
export async function getCachedReview(versionId: string): Promise<CachedReview | null> {
  try {
    const [stat, metaRaw] = await Promise.all([
      fs.stat(binPath(versionId)),
      fs.readFile(metaPath(versionId), "utf8"),
    ]);
    if (!stat.isFile() || stat.size === 0) return null;
    const meta = JSON.parse(metaRaw) as { mime?: string };
    // "Toca" el archivo (marca de último acceso) para el LRU, sin bloquear la respuesta.
    const now = new Date();
    void fs.utimes(binPath(versionId), now, now).catch(() => {});
    return { path: binPath(versionId), size: stat.size, mime: meta.mime || "video/mp4" };
  } catch {
    return null;
  }
}

// Baja el archivo de Drive a la caché UNA vez (idempotente y deduplicado). NO lanza: si el archivo
// está bloqueado por cuota, es privado o falla la red, simplemente no queda cacheado y se reintenta
// en la siguiente apertura. Pensado para llamarse "fire-and-forget" desde la ruta del proxy.
export async function ensureReviewCached(versionId: string, driveId: string, name: string): Promise<void> {
  if (inFlight.has(versionId)) return;
  if (await getCachedReview(versionId)) return;
  inFlight.add(versionId);
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const res = await fetchDriveDownload(driveId);
    if (!res.ok && res.status !== 206) return;
    const ctype = res.headers.get("content-type") || "";
    // Drive devuelve HTML cuando el archivo está bloqueado por cuota o no es público → no es
    // reproducible: no cacheamos esa "basura" (se reintentará cuando Drive lo libere).
    if (ctype.includes("text/html")) return;
    const len = Number(res.headers.get("content-length") || "0");
    if (len && len > MAX_FILE_BYTES) return; // demasiado grande: se sigue proxiando en vivo
    if (!res.body) return;

    const part = partPath(versionId);
    await pipeline(Readable.fromWeb(res.body as unknown as NodeWebReadableStream), createWriteStream(part));
    const st = await fs.stat(part);
    if (st.size === 0) {
      await fs.rm(part, { force: true });
      return;
    }
    const mime =
      ctype && !ctype.includes("octet-stream") ? ctype.split(";")[0].trim() : guessDriveMime(name);
    // El .bin primero y la meta .json al final: getCachedReview exige AMBOS, así que una descarga
    // a medias (sin meta) nunca se sirve como completa.
    await fs.rename(part, binPath(versionId));
    await fs.writeFile(metaPath(versionId), JSON.stringify({ mime, name, size: st.size, at: Date.now() }));
    void enforceLru().catch(() => {});
  } catch {
    await fs.rm(partPath(versionId), { force: true }).catch(() => {});
  } finally {
    inFlight.delete(versionId);
  }
}

// LRU: si el caché supera el tope, borra los archivos menos usados recientemente (por mtime, que
// "tocamos" al servir) hasta quedar bajo el límite. Cada .bin arrastra su .json.
async function enforceLru(): Promise<void> {
  const names = await fs.readdir(CACHE_DIR).catch(() => [] as string[]);
  const entries: { version: string; size: number; atimeMs: number }[] = [];
  for (const n of names) {
    if (!n.endsWith(".bin")) continue;
    const version = n.slice(0, -".bin".length);
    try {
      const st = await fs.stat(path.join(CACHE_DIR, n));
      entries.push({ version, size: st.size, atimeMs: st.mtimeMs });
    } catch {
      /* ignora entradas que desaparecieron entre readdir y stat */
    }
  }
  let total = entries.reduce((s, e) => s + e.size, 0);
  if (total <= MAX_TOTAL_BYTES) return;
  entries.sort((a, b) => a.atimeMs - b.atimeMs); // el más viejo (menos usado) primero
  for (const e of entries) {
    if (total <= MAX_TOTAL_BYTES) break;
    await fs.rm(binPath(e.version), { force: true }).catch(() => {});
    await fs.rm(metaPath(e.version), { force: true }).catch(() => {});
    total -= e.size;
  }
}

// Purga la caché de los entregables APROBADOS hace más de `days` días. Una vez aprobado, el video
// ya no se revisa, así que su copia en el NAS se borra para liberar espacio (el ORIGINAL sigue en
// Drive; si alguien reabre un aprobado viejo, se vuelve a cachear al momento). Idempotente: se
// engancha al cron de Marcebot (cada 2 h), no necesita tarea nueva en el NAS.
export async function purgeApprovedReviewCache(days = 7): Promise<{ purged: number }> {
  let names: string[];
  try {
    names = await fs.readdir(CACHE_DIR);
  } catch {
    return { purged: 0 }; // aún no existe la carpeta de caché
  }
  const cachedVersionIds = new Set(names.filter((n) => n.endsWith(".bin")).map((n) => n.slice(0, -".bin".length)));
  if (cachedVersionIds.size === 0) return { purged: 0 };

  const cutoff = new Date(Date.now() - days * 86_400_000);
  // Entregables aprobados/entregados cuya ÚLTIMA decisión es APROBADO y anterior al corte (así una
  // pieza re-aprobada hace poco NO se purga aunque tuviera un APROBADO viejo).
  const approved = await db.deliverable.findMany({
    where: { status: { in: ["APROBADO", "ENTREGADO"] } },
    select: {
      versions: { select: { id: true } },
      decisions: { orderBy: { createdAt: "desc" }, take: 1, select: { result: true, createdAt: true } },
    },
  });

  let purged = 0;
  for (const d of approved) {
    const last = d.decisions[0];
    if (!last || last.result !== "APROBADO" || last.createdAt >= cutoff) continue;
    for (const v of d.versions) {
      if (!cachedVersionIds.has(v.id)) continue;
      await fs.rm(binPath(v.id), { force: true }).catch(() => {});
      await fs.rm(metaPath(v.id), { force: true }).catch(() => {});
      purged++;
    }
  }
  return { purged };
}

// Construye la respuesta sirviendo el archivo cacheado desde el NAS, con soporte de Range (206)
// para que el <video> reproduzca y busque igual que con /api/files-asset.
export function serveCachedReview(cached: CachedReview, rangeHeader: string | null): Response {
  const { path: abs, size, mime } = cached;
  const base: Record<string, string> = {
    "content-type": mime || "video/mp4",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "x-review-cache": "hit",
  };
  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (m && size > 0) {
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= size) end = size - 1;
    if (start > end || start >= size) {
      return new Response("Rango no satisfacible", {
        status: 416,
        headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes" },
      });
    }
    const stream = Readable.toWeb(createReadStream(abs, { start, end })) as unknown as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(createReadStream(abs)) as unknown as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...base, "content-length": String(size) } });
}
