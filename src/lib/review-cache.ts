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
const MAX_TOTAL_BYTES = 40 * 1024 * 1024 * 1024; // 40 GB: tope del caché (LRU por último acceso). Hay
// proyectos de varios GB por pieza, así que 20 GB se quedaba corto y expulsaba videos aún en revisión.
const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024; // un único archivo > 4 GB no se cachea (se proxia en vivo)

// Descargas en curso: comparte la MISMA descarga entre peticiones concurrentes (un contenedor Node),
// para que N visitas simultáneas de un video aún sin cachear NO disparen N descargas de Drive.
const inFlight = new Map<string, Promise<CachedReview | null>>();
// Enfriamiento tras un fallo (p. ej. "Quota exceeded" de Drive): durante este tiempo NO se reintenta
// la descarga de esa versión, para no machacar un archivo bloqueado y dejar que Google lo libere.
const lastFail = new Map<string, number>();
const FAIL_COOLDOWN_MS = 10 * 60_000;

const binPath = (versionId: string) => path.join(CACHE_DIR, `${versionId}.bin`);
const metaPath = (versionId: string) => path.join(CACHE_DIR, `${versionId}.json`);
const partPath = (versionId: string) => path.join(CACHE_DIR, `${versionId}.part`);

export type CachedReview = { path: string; size: number; mime: string };

// ¿Se está bajando AHORA la copia de esta versión? La ruta lo consulta para NO proxiar Drive en
// vivo mientras tanto: el <video> pide decenas de rangos y cada uno seria otro golpe a Drive, que
// agota la cuota diaria del archivo ANTES de que la copia termine — y entonces Google lo bloquea y
// ya no se puede cachear nunca (circulo vicioso). Preferimos que esa primera visita caiga al visor
// de Google (se ve, sin captura) y que la copia termine tranquila: la siguiente visita ya sale del
// NAS, con captura y para siempre.
export function isCachingInFlight(versionId: string): boolean {
  return inFlight.has(versionId);
}

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

// Asegura la caché de una versión: si ya está, la devuelve; si no, la baja de Drive UNA vez
// (deduplicando peticiones concurrentes y respetando el enfriamiento tras fallo). Devuelve la
// CachedReview lista para servir, o null si no se pudo (bloqueada por cuota, privada, muy grande…).
// NO lanza. La ruta la espera un poco y, si llega a tiempo, sirve de esta MISMA descarga (una sola
// vez se toca Drive por archivo, en vez de proxiar en vivo en cada visita).
export async function ensureReviewCached(versionId: string, driveId: string, name: string): Promise<CachedReview | null> {
  const hit = await getCachedReview(versionId);
  if (hit) return hit;
  const running = inFlight.get(versionId);
  if (running) return running; // otra petición ya la está bajando: comparte su resultado
  const failedAt = lastFail.get(versionId);
  if (failedAt && Date.now() - failedAt < FAIL_COOLDOWN_MS) return null; // en enfriamiento
  const p = downloadToCache(versionId, driveId, name).finally(() => inFlight.delete(versionId));
  inFlight.set(versionId, p);
  return p;
}

async function downloadToCache(versionId: string, driveId: string, name: string): Promise<CachedReview | null> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const res = await fetchDriveDownload(driveId);
    const ctype = res.headers.get("content-type") || "";
    // Drive devuelve HTML cuando el archivo está bloqueado por cuota o no es público → no cacheable.
    if ((!res.ok && res.status !== 206) || ctype.includes("text/html") || !res.body) {
      lastFail.set(versionId, Date.now());
      return null;
    }
    const len = Number(res.headers.get("content-length") || "0");
    if (len && len > MAX_FILE_BYTES) return null; // demasiado grande: se proxia en vivo (no es fallo de cuota)

    const part = partPath(versionId);
    await pipeline(Readable.fromWeb(res.body as unknown as NodeWebReadableStream), createWriteStream(part));
    const st = await fs.stat(part);
    if (st.size === 0) {
      await fs.rm(part, { force: true });
      lastFail.set(versionId, Date.now());
      return null;
    }
    const mime = ctype && !ctype.includes("octet-stream") ? ctype.split(";")[0].trim() : guessDriveMime(name);
    // El .bin primero y la meta .json al final: getCachedReview exige AMBOS, así que una descarga
    // a medias (sin meta) nunca se sirve como completa.
    await fs.rename(part, binPath(versionId));
    await fs.writeFile(metaPath(versionId), JSON.stringify({ mime, name, size: st.size, at: Date.now() }));
    lastFail.delete(versionId);
    void enforceLru().catch(() => {});
    return { path: binPath(versionId), size: st.size, mime };
  } catch {
    await fs.rm(partPath(versionId), { force: true }).catch(() => {});
    lastFail.set(versionId, Date.now());
    return null;
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
    let start: number;
    let end: number;
    if (!m[1] && m[2]) {
      // Rango SUFIJO ("bytes=-N") = los ÚLTIMOS N bytes. Así es como el navegador busca el índice
      // (átomo «moov») de un MP4 no optimizado para web, que va al FINAL del archivo. Devolverle
      // los PRIMEROS N dejaba al <video> sin encontrar el índice → cargando para siempre, sin
      // duración ni fotograma (justo el síntoma que se estaba arreglando).
      const n = parseInt(m[2], 10);
      if (!Number.isFinite(n) || n <= 0) {
        return new Response("Rango no satisfacible", {
          status: 416,
          headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes" },
        });
      }
      start = Math.max(0, size - n);
      end = size - 1;
    } else {
      start = m[1] ? parseInt(m[1], 10) : 0;
      end = m[2] ? parseInt(m[2], 10) : size - 1;
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= size) end = size - 1;
    }
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
