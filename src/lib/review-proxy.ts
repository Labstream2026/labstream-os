import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { absPath } from "@/lib/storage";
import { getCachedReview, ensureReviewCached } from "@/lib/review-cache";
import { resolveDriveMediaFile } from "@/lib/drive";

// ── Proxy de revisión ──
// Genera en segundo plano una copia ligera H.264 (escala por orientación, CRF 23, faststart)
// y la anota en DeliverableVersion.proxyRel. La sala reproduce esa copia (mismo origen → las
// capturas de fotograma siguen funcionando) y el original queda intacto para descarga/entrega.
// CICLO DE VIDA: el proxy nace al subir (o lo recoge el barrido), vive mientras la pieza se
// revisa y MUERE 7 días después de la aprobación (mismo criterio que la purga de la caché de
// Drive); si el cliente reabre con cambios, el barrido lo re-cocina solo.
// Todo es best-effort: sin ffmpeg, o si la transcodificación falla, simplemente no hay proxy
// y se reproduce el original.

// Sufijo del proxy. «proxy2» = receta v2 (escala por orientación + CRF 23). El sufijo permite
// distinguir proxies de la receta v1 (verticales a 608 px, CRF 26) y RE-cocinarlos con el
// barrido, sin columnas nuevas en la BD.
export const PROXY_SUFFIX = ".proxy2.mp4";
// Carpeta de los proxies de versiones SIN archivo local (masters de Drive): el proxy vive
// aparte porque no hay un «hermano» local al cual pegarse.
const DRIVE_PROXY_DIR = "drive-proxy";

// Extensiones de video que vale la pena transcodificar (incluye contenedores que el
// navegador NO reproduce, como MKV/AVI/MXF: el proxy es justo lo que los hace visibles).
const VIDEO_RE = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|mts|m2ts|mxf|ogv|mpg|mpeg)$/i;

export function isProxyableVideo(name: string, mime?: string | null): boolean {
  return VIDEO_RE.test(name) || (mime ?? "").toLowerCase().startsWith("video/");
}

// Un master largo puede tardar horas en el NAS; pasado este margen se corta el proceso
// para que la cola no quede bloqueada por un ffmpeg colgado.
const TIMEOUT_MS = 4 * 60 * 60 * 1000;
// Margen de gracia tras la APROBACIÓN antes de borrar el proxy (el invitado puede reabrir
// un aprobado; 7 días lo cubren de sobra). Elegido por Jonathan.
const APPROVED_GRACE_MS = 7 * 24 * 3600 * 1000;
// Estados en los que la pieza SE ESTÁ revisando (se cocina proxy). Aprobado/entregado no.
const ACTIVE_STATES = ["PENDIENTE", "EN_PRODUCCION", "EN_EDICION", "REVISION_INTERNA", "ENVIADO_CLIENTE", "CORRECCIONES"] as const;

// Cola SECUENCIAL en proceso: un solo ffmpeg a la vez. El NAS comparte CPU/RAM con
// Postgres y OnlyOffice; dos transcodificaciones en paralelo lo pondrían de rodillas.
let queue: Promise<void> = Promise.resolve();
// En vuelo + intentados (por proceso): el barrido no re-encola lo que ya está en la fila ni
// martilla eternamente un archivo que ffmpeg no puede convertir. Tras un reinicio ambos
// quedan vacíos → lo pendiente se reintenta (la cola es en-memoria y un reinicio la perdía).
const inFlight = new Set<string>();
const attempted = new Set<string>();

function enqueue(versionId: string, job: () => Promise<void>): void {
  if (inFlight.has(versionId)) return;
  inFlight.add(versionId);
  attempted.add(versionId);
  queue = queue
    .then(job)
    .catch(() => {})
    .finally(() => {
      inFlight.delete(versionId);
    });
}

// Versión con ARCHIVO LOCAL (subida al NAS): el proxy nace junto al original.
export function queueReviewProxy(versionId: string, rel: string): void {
  enqueue(versionId, () => cook(versionId, absPath(rel), rel + PROXY_SUFFIX));
}

// Versión de DRIVE: cocina DESDE la copia que review-cache ya bajó (una sola descarga de
// Drive). Al terminar, borra el master cacheado (pesado): queda solo el proxy ligero →
// el NAS emite el peso del proxy por reproducción, no el del master.
export function queueReviewProxyFromCache(versionId: string, cachedPath: string): void {
  enqueue(versionId, async () => {
    await cook(versionId, cachedPath, path.posix.join(DRIVE_PROXY_DIR, `${versionId}${PROXY_SUFFIX}`));
    // El master cacheado ya cumplió su misión (best-effort: si algo lo usa, el LRU lo limpia igual).
    await fs.rm(cachedPath, { force: true }).catch(() => {});
    await fs.rm(cachedPath.replace(/\.bin$/, ".json"), { force: true }).catch(() => {});
  });
}

// Escala POR ORIENTACIÓN, sin agrandar y con lados pares: horizontal → alto máx 1080;
// vertical → ANCHO máx 1080 (la receta v1 fijaba el alto y dejaba los reels 9:16 en
// 608 px de ancho — borrosos en el celular, que es justo donde se revisan).
const VF_ORIENTACION = "scale=if(gte(iw\\,ih)\\,-2\\,2*trunc(min(1080\\,iw)/2)):if(gte(iw\\,ih)\\,2*trunc(min(1080\\,ih)/2)\\,-2)";
// RED DE SEGURIDAD: si el ffmpeg del NAS rechazara la expresión de arriba (builds viejos),
// se reintenta UNA vez con la escala clásica — mejor un proxy sencillo que ninguno.
const VF_CLASICA = "scale=-2:2*trunc(min(1080\\,ih)/2)";

function runFfmpeg(inputAbs: string, outAbs: string, vf: string): Promise<void> {
  const args = [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", inputAbs,
    "-vf", vf,
    // yuv420p: los masters 10-bit (ProRes/HEVC) producirían High10, que el navegador
    // no reproduce. CRF 23 (v1 usaba 26: se notaba) + preset fast = revisión nítida.
    "-c:v", "libx264", "-crf", "23", "-preset", "fast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k",
    // faststart: índice «moov» al principio → el player arranca sin bajar el archivo.
    "-movflags", "+faststart",
    outAbs,
  ];
  return new Promise<void>((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    // Corte a mano (la opción `timeout` de spawn deja su timer armado si el spawn
    // falla —ENOENT— y retiene el event loop 4 h). unref: no retiene el proceso.
    const killer = setTimeout(() => p.kill("SIGKILL"), TIMEOUT_MS);
    killer.unref();
    let err = "";
    p.stderr?.on("data", (d: Buffer) => { if (err.length < 4000) err += d.toString(); });
    p.on("error", (e) => { clearTimeout(killer); reject(e); }); // ffmpeg ausente (ENOENT) o fallo al lanzar
    p.on("close", (code, signal) => {
      clearTimeout(killer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg terminó con ${signal ?? code}: ${err.trim().slice(0, 500)}`));
    });
  });
}

async function cook(versionId: string, inputAbs: string, outRel: string): Promise<void> {
  const tmpRel = outRel + ".part";
  try {
    await fs.stat(inputAbs); // el original debe seguir ahí (pudo borrarse en cola)
    await fs.mkdir(path.dirname(absPath(outRel)), { recursive: true });
    await fs.rm(absPath(tmpRel), { force: true }).catch(() => {});

    try {
      await runFfmpeg(inputAbs, absPath(tmpRel), VF_ORIENTACION);
    } catch (e1) {
      // ENOENT (sin ffmpeg) no tiene arreglo con otra receta; el resto sí se reintenta.
      if ((e1 as NodeJS.ErrnoException)?.code === "ENOENT") throw e1;
      console.warn(`[review-proxy] receta por orientación falló para ${versionId}, reintento clásico: ${e1 instanceof Error ? e1.message : e1}`);
      await fs.rm(absPath(tmpRel), { force: true }).catch(() => {});
      await runFfmpeg(inputAbs, absPath(tmpRel), VF_CLASICA);
    }

    const st = await fs.stat(absPath(tmpRel));
    if (st.size <= 0) throw new Error("el proxy quedó vacío");
    // Si esto es un RE-cocinado (receta nueva sobre proxy v1), el archivo anterior queda
    // huérfano: se borra tras anotar el nuevo, para no acumular gigas de proxies viejos.
    const prev = await db.deliverableVersion.findUnique({ where: { id: versionId }, select: { proxyRel: true } });
    await fs.rename(absPath(tmpRel), absPath(outRel));
    await db.deliverableVersion.update({ where: { id: versionId }, data: { proxyRel: outRel } });
    if (prev?.proxyRel && prev.proxyRel !== outRel) await fs.rm(absPath(prev.proxyRel), { force: true }).catch(() => {});
    console.log(`[review-proxy] listo ${outRel} (${Math.round(st.size / 1e6)} MB)`);
  } catch (e) {
    // Sin proxy no se rompe nada: la revisión reproduce el original.
    await fs.rm(absPath(tmpRel), { force: true }).catch(() => {});
    console.warn(`[review-proxy] sin proxy para la versión ${versionId}: ${e instanceof Error ? e.message : e}`);
  }
}

// ── Barrido (colgado del cron de recordatorios) ──
// 1) COCINA lo pendiente de piezas EN revisión: versiones sin proxy (cola en-memoria perdida
//    en un reinicio, ffmpeg recién instalado, o master de Drive ya cacheado) y proxies de la
//    receta v1 (para re-cocinarlos en v2). Drive sin caché aún → dispara la descarga en
//    segundo plano y lo recoge la próxima pasada.
// 2) BORRA los proxies de piezas APROBADAS/ENTREGADAS con más de 7 días de gracia (recupera
//    el disco del NAS; espejo de purgeApprovedReviewCache). Si la pieza se reabre, vuelve a
//    estados activos y el punto 1 la re-cocina sola.
export async function sweepReviewProxies(limit = 2): Promise<{ queued: number; deleted: number }> {
  // 1) Cocinar
  const candidates = await db.deliverableVersion.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 60 * 24 * 3600 * 1000) },
      deliverable: { status: { in: [...ACTIVE_STATES] } },
      AND: [
        { OR: [{ proxyRel: null }, { proxyRel: { endsWith: ".proxy.mp4" } }] },
        { OR: [{ fileAssetId: { not: null } }, { fileUrl: { not: null } }] },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, fileUrl: true, fileAsset: { select: { path: true, name: true, mime: true } } },
  });
  let queued = 0;
  for (const v of candidates) {
    if (queued >= limit) break;
    if (inFlight.has(v.id) || attempted.has(v.id)) continue;
    if (v.fileAsset?.path && isProxyableVideo(v.fileAsset.name, v.fileAsset.mime)) {
      queueReviewProxy(v.id, v.fileAsset.path);
      queued += 1;
    } else if (!v.fileAsset && v.fileUrl) {
      const cached = await getCachedReview(v.id);
      if (cached) {
        queueReviewProxyFromCache(v.id, cached.path);
        queued += 1;
      } else {
        // Aún no hay copia local del master: dispara la descarga (deduplicada y con
        // enfriamiento en review-cache) y esta versión se cocina en la próxima pasada.
        const media = await resolveDriveMediaFile(v.fileUrl).catch(() => null);
        if (media?.isVideo) void ensureReviewCached(v.id, media.id, media.name).catch(() => {});
      }
    }
  }

  // 2) Borrar (aprobadas + 7 días)
  const stale = await db.deliverableVersion.findMany({
    where: { proxyRel: { not: null }, deliverable: { status: { in: ["APROBADO", "ENTREGADO"] } } },
    take: 12,
    select: {
      id: true,
      proxyRel: true,
      deliverable: {
        select: {
          updatedAt: true,
          decisions: { where: { result: "APROBADO" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        },
      },
    },
  });
  let deleted = 0;
  for (const v of stale) {
    const approvedAt = v.deliverable.decisions[0]?.createdAt ?? v.deliverable.updatedAt;
    if (Date.now() - approvedAt.getTime() < APPROVED_GRACE_MS) continue;
    await fs.rm(absPath(v.proxyRel!), { force: true }).catch(() => {});
    await db.deliverableVersion.update({ where: { id: v.id }, data: { proxyRel: null } });
    // Si la pieza se reabre después, este proceso puede volver a cocinarla.
    attempted.delete(v.id);
    deleted += 1;
  }
  if (queued || deleted) console.log(`[review-proxy] barrido: ${queued} en cocina · ${deleted} borrados (aprobados)`);
  return { queued, deleted };
}
