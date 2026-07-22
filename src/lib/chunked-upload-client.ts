"use client";

import { CRC32_INIT, crc32Update, crc32Hex } from "@/lib/crc32";

// ── Cliente de subida por TROZOS ──
// Parte el archivo en trozos de 8 MB y los envía en orden con offset explícito: progreso
// real, reintentos con backoff por trozo, pausa/reanudar y resincronización ante 409.
// Va calculando el CRC32 del archivo para que el servidor verifique la integridad al final.

const CHUNK = 8 * 1024 * 1024;
const RETRIES = 4;
const BACKOFF = [1000, 3000, 8000, 15000];

export type UploadProgress = {
  sent: number;
  total: number;
  pct: number;
  speedBps: number | null;
  etaSec: number | null;
};

export type ChunkedHandle = {
  /** Se resuelve al terminar de subir TODOS los trozos (antes del finish). */
  done: Promise<{ uploadId: string; crc32: string }>;
  pause: () => void;
  resume: () => void;
  cancel: () => Promise<void>;
};

export function startChunkedUpload(
  file: File,
  opts: { projectId: string; onProgress?: (p: UploadProgress) => void; onStateChange?: (s: "subiendo" | "pausada" | "reintentando") => void },
): ChunkedHandle {
  let paused = false;
  let cancelled = false;
  let wake: (() => void) | null = null;
  let uploadId: string | null = null;

  const waitIfPaused = async () => {
    while (paused && !cancelled) await new Promise<void>((r) => (wake = r));
  };

  const report = (() => {
    // Velocidad por ventana móvil de los últimos ~5 s (más honesta que el promedio total).
    const window: { t: number; sent: number }[] = [];
    return (sent: number) => {
      const now = Date.now();
      window.push({ t: now, sent });
      while (window.length > 2 && now - window[0].t > 5000) window.shift();
      const first = window[0];
      const dt = (now - first.t) / 1000;
      const speed = dt > 0.5 ? (sent - first.sent) / dt : null;
      const remaining = file.size - sent;
      opts.onProgress?.({
        sent,
        total: file.size,
        pct: file.size ? Math.floor((sent / file.size) * 100) : 0,
        speedBps: speed,
        etaSec: speed && speed > 0 ? Math.ceil(remaining / speed) : null,
      });
    };
  })();

  const done = (async () => {
    // Init
    const initRes = await fetch("/api/upload/chunked", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName: file.name, size: file.size, mime: file.type || "application/octet-stream", projectId: opts.projectId }),
    });
    const init = await initRes.json().catch(() => ({}));
    if (!initRes.ok) throw new Error(init.error ?? "No se pudo iniciar la subida.");
    uploadId = init.id as string;

    let offset = 0;
    let crc = CRC32_INIT;
    report(0);

    while (offset < file.size) {
      if (cancelled) throw new Error("Subida cancelada.");
      await waitIfPaused();
      const end = Math.min(offset + CHUNK, file.size);
      // El trozo se lee UNA vez a memoria (8 MB): sirve para enviar y para el CRC.
      const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());

      let attempt = 0;
      for (;;) {
        if (cancelled) throw new Error("Subida cancelada.");
        await waitIfPaused();
        try {
          const res = await fetch(`/api/upload/chunked/${uploadId}?offset=${offset}`, { method: "PUT", body: bytes });
          const out = await res.json().catch(() => ({}));
          if (res.ok) break;
          // Fuera de secuencia: el servidor dice qué recibió — nos resincronizamos a eso.
          if (res.status === 409 && Number.isFinite(out.received)) {
            if (out.received > offset) {
              // Ese trozo (o parte) ya estaba: saltamos a lo recibido. El CRC sigue siendo válido
              // solo si avanzamos trozos COMPLETOS; por diseño el servidor recibe trozos enteros.
              offset = out.received;
            }
            break;
          }
          throw new Error(out.error ?? `Fallo al subir (HTTP ${res.status})`);
        } catch (e) {
          if (attempt >= RETRIES) throw e instanceof Error ? e : new Error("Fallo de red al subir.");
          opts.onStateChange?.("reintentando");
          await new Promise((r) => setTimeout(r, BACKOFF[Math.min(attempt, BACKOFF.length - 1)]));
          attempt += 1;
        }
      }
      // CRC de lo que acabamos de consolidar (el trozo entero, en orden).
      crc = crc32Update(crc, bytes);
      offset = end;
      report(offset);
      opts.onStateChange?.("subiendo");
    }
    return { uploadId, crc32: crc32Hex(crc) };
  })();

  return {
    done,
    pause: () => {
      paused = true;
      opts.onStateChange?.("pausada");
    },
    resume: () => {
      paused = false;
      opts.onStateChange?.("subiendo");
      wake?.();
    },
    cancel: async () => {
      cancelled = true;
      paused = false;
      wake?.();
      if (uploadId) await fetch(`/api/upload/chunked/${uploadId}`, { method: "DELETE" }).catch(() => {});
    },
  };
}

// Lector de metadatos del video EN el navegador: duración + fotograma de portada (JPEG ≤400 KB),
// misma información que captura el formulario clásico del panel — la subida por trozos no
// pierde ni la duración ni la auto-portada.
export async function probeVideo(file: File): Promise<{ durationSec: number | null; poster: string | null }> {
  if (!file.type.startsWith("video/")) return { durationSec: null, poster: null };
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("metadata"));
      setTimeout(() => rej(new Error("timeout")), 10000);
    }).catch(() => {});
    const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null;

    let poster: string | null = null;
    if (durationSec) {
      try {
        video.currentTime = Math.min(1, video.duration * 0.1);
        await new Promise<void>((res) => {
          video.onseeked = () => res();
          setTimeout(() => res(), 4000);
        });
        const canvas = document.createElement("canvas");
        const w = Math.min(640, video.videoWidth || 640);
        const h = Math.round(w * ((video.videoHeight || 360) / (video.videoWidth || 640)));
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")?.drawImage(video, 0, 0, w, h);
        for (const q of [0.75, 0.55, 0.4]) {
          const data = canvas.toDataURL("image/jpeg", q);
          if (data.length < 400_000 * 1.37) {
            poster = data;
            break;
          }
        }
      } catch {
        /* sin poster no pasa nada: la portada se puede subir a mano */
      }
    }
    return { durationSec, poster };
  } finally {
    URL.revokeObjectURL(url);
  }
}
