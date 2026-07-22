import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { absPath } from "@/lib/storage";

// ── Proxy de revisión ──
// Genera en segundo plano una copia 1080p H.264 (CRF 26, faststart) junto al ORIGINAL
// subido, y la anota en DeliverableVersion.proxyRel. La sala de revisión reproduce esa
// copia ligera (mismo origen → las capturas de fotograma siguen funcionando) y el
// original queda intacto para descarga/entrega final. Todo es best-effort: sin ffmpeg,
// o si la transcodificación falla, simplemente no hay proxy y se reproduce el original.

// Sufijo del proxy (hermano del original en el storage, como «.opt.webp» en imágenes).
// «proxy2» = receta v2 (escala por orientación + CRF 23). El sufijo en el nombre permite
// distinguir proxies viejos (v1: verticales a 608 px de ancho, CRF 26) y RE-COCINARLOS
// con el barrido de abajo, sin columnas nuevas en la BD.
export const PROXY_SUFFIX = ".proxy2.mp4";

// Extensiones de video que vale la pena transcodificar (incluye contenedores que el
// navegador NO reproduce, como MKV/AVI/MXF: el proxy es justo lo que los hace visibles).
const VIDEO_RE = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|mts|m2ts|mxf|ogv|mpg|mpeg)$/i;

export function isProxyableVideo(name: string, mime?: string | null): boolean {
  return VIDEO_RE.test(name) || (mime ?? "").toLowerCase().startsWith("video/");
}

// Un master largo puede tardar horas en el NAS; pasado este margen se corta el proceso
// para que la cola no quede bloqueada por un ffmpeg colgado.
const TIMEOUT_MS = 4 * 60 * 60 * 1000;

// Cola SECUENCIAL en proceso: un solo ffmpeg a la vez. El NAS comparte CPU/RAM con
// Postgres y OnlyOffice (contenedor capado a 3 GB); dos transcodificaciones en paralelo
// lo pondrían de rodillas. Si el servidor se reinicia a mitad, no pasa nada: la versión
// queda sin proxy y se reproduce el original.
let queue: Promise<void> = Promise.resolve();
// En vuelo + intentados (por proceso): el barrido de recuperación no re-encola lo que ya
// está en la fila ni martilla eternamente un archivo que ffmpeg no puede convertir. Tras
// un reinicio ambos sets quedan vacíos → lo pendiente se reintenta (que es lo que queremos:
// la cola es en-memoria y un reinicio a mitad la perdía para siempre).
const inFlight = new Set<string>();
const attempted = new Set<string>();

export function queueReviewProxy(versionId: string, rel: string): void {
  if (inFlight.has(versionId)) return;
  inFlight.add(versionId);
  attempted.add(versionId);
  queue = queue
    .then(() => transcode(versionId, rel))
    .catch(() => {})
    .finally(() => {
      inFlight.delete(versionId);
    });
}

// ── Barrido de recuperación/mejora ──
// La cola vive en memoria: si la app se reinicia (deploy, OOM), lo encolado se pierde y esas
// versiones quedan SIN proxy (y un master ProRes/HEVC/MKV ni se reproduce ni se captura).
// Este barrido —colgado del cron de recordatorios— re-encola de a poquitos:
//  • versiones de video sin proxy (cola perdida o ffmpeg recién instalado), y
//  • proxies de la receta VIEJA (v1: verticales borrosos) para re-cocinarlos en v2.
// Máximo `limit` por pasada y un ffmpeg a la vez: el NAS nunca se pone de rodillas.
export async function sweepReviewProxies(limit = 2): Promise<{ queued: number }> {
  const candidates = await db.deliverableVersion.findMany({
    where: {
      fileAssetId: { not: null },
      createdAt: { gte: new Date(Date.now() - 60 * 24 * 3600 * 1000) },
      OR: [{ proxyRel: null }, { proxyRel: { endsWith: ".proxy.mp4" } }],
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, fileAsset: { select: { path: true, name: true, mime: true } } },
  });
  let queued = 0;
  for (const v of candidates) {
    if (queued >= limit) break;
    if (!v.fileAsset?.path || !isProxyableVideo(v.fileAsset.name, v.fileAsset.mime)) continue;
    if (inFlight.has(v.id) || attempted.has(v.id)) continue;
    queueReviewProxy(v.id, v.fileAsset.path);
    queued += 1;
  }
  return { queued };
}

async function transcode(versionId: string, rel: string): Promise<void> {
  const outRel = rel + PROXY_SUFFIX;
  const tmpRel = rel + ".proxy.part.mp4"; // se escribe aparte y se renombra al acabar
  try {
    const input = absPath(rel);
    const tmp = absPath(tmpRel);
    await fs.stat(input); // el original debe seguir ahí (pudo borrarse en cola)
    await fs.rm(tmp, { force: true }).catch(() => {});

    const args = [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", input,
      // 1080p sin AGRANDAR (min con la altura original) y alto par (libx264 + yuv420p
      // exigen dimensiones pares; la coma va escapada para el parser de filtros).
      // Escala POR ORIENTACIÓN, sin agrandar y con lados pares: horizontal → alto máx 1080;
      // vertical → ANCHO máx 1080 (la receta v1 fijaba el alto y dejaba los reels 9:16 en
      // 608 px de ancho — borrosos en el celular, que es justo donde se revisan).
      "-vf", "scale=if(gte(iw\\,ih)\\,-2\\,2*trunc(min(1080\\,iw)/2)):if(gte(iw\\,ih)\\,2*trunc(min(1080\\,ih)/2)\\,-2)",
      // yuv420p: los masters 10-bit (ProRes/HEVC) producirían High10, que el navegador
      // no reproduce. CRF 23 (v1 usaba 26: se notaba) + preset fast = revisión nítida sin
      // tamaño de entrega.
      "-c:v", "libx264", "-crf", "23", "-preset", "fast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      // faststart: índice «moov» al principio → el player arranca sin bajar el archivo.
      "-movflags", "+faststart",
      tmp,
    ];
    await new Promise<void>((resolve, reject) => {
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

    const st = await fs.stat(tmp);
    if (st.size <= 0) throw new Error("el proxy quedó vacío");
    // Si esto es un RE-cocinado (receta nueva sobre proxy v1), el archivo anterior queda
    // huérfano: se borra tras anotar el nuevo, para no acumular gigas de proxies viejos.
    const prev = await db.deliverableVersion.findUnique({ where: { id: versionId }, select: { proxyRel: true } });
    await fs.rename(tmp, absPath(outRel));
    await db.deliverableVersion.update({ where: { id: versionId }, data: { proxyRel: outRel } });
    if (prev?.proxyRel && prev.proxyRel !== outRel) await fs.rm(absPath(prev.proxyRel), { force: true }).catch(() => {});
    console.log(`[review-proxy] listo ${outRel} (${Math.round(st.size / 1e6)} MB)`);
  } catch (e) {
    // Sin proxy no se rompe nada: la revisión reproduce el original.
    await fs.rm(absPath(tmpRel), { force: true }).catch(() => {});
    console.warn(`[review-proxy] sin proxy para la versión ${versionId}: ${e instanceof Error ? e.message : e}`);
  }
}
