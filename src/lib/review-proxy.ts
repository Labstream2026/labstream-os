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
export const PROXY_SUFFIX = ".proxy.mp4";

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

export function queueReviewProxy(versionId: string, rel: string): void {
  queue = queue.then(() => transcode(versionId, rel)).catch(() => {});
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
      "-vf", "scale=-2:2*trunc(min(1080\\,ih)/2)",
      // yuv420p: los masters 10-bit (ProRes/HEVC) producirían High10, que el navegador
      // no reproduce. CRF 26 + preset fast = tamaño de revisión, no de entrega.
      "-c:v", "libx264", "-crf", "26", "-preset", "fast", "-pix_fmt", "yuv420p",
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
    await fs.rename(tmp, absPath(outRel));
    await db.deliverableVersion.update({ where: { id: versionId }, data: { proxyRel: outRel } });
    console.log(`[review-proxy] listo ${outRel} (${Math.round(st.size / 1e6)} MB)`);
  } catch (e) {
    // Sin proxy no se rompe nada: la revisión reproduce el original.
    await fs.rm(absPath(tmpRel), { force: true }).catch(() => {});
    console.warn(`[review-proxy] sin proxy para la versión ${versionId}: ${e instanceof Error ? e.message : e}`);
  }
}
