"use client";

import * as React from "react";
import { Pause, Play, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { startChunkedUpload, probeVideo, type ChunkedHandle, type UploadProgress } from "@/lib/chunked-upload-client";

// ── Formulario del panel con subida por TROZOS transparente ──
// Envuelve los formularios clásicos de entregables (crear con v1 / añadir versión) sin tocar
// sus campos. Archivos pequeños (≤50 MB): el envío va EXACTO como siempre por la server action
// (misma captura de duración/poster de VideoUploadField). Archivos grandes: se intercepta el
// envío, el archivo viaja por trozos (progreso real, pausa, reintentos, CRC32) y la MISMA
// server action recibe el resto del formulario + la referencia chunkUploadId — así portada,
// plazos, tareas vinculadas y notificaciones salen idénticos por ambos caminos.

const THRESHOLD = 50 * 1024 * 1024; // >50 MB → por trozos (las server actions topan en 100 MB)
const GB = 1024 * 1024 * 1024;

function fmtBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${Math.round(n / 1024 / 1024)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}
function fmtEta(s: number | null): string {
  if (s == null) return "";
  if (s < 60) return `quedan ~${s} s`;
  return `quedan ~${Math.ceil(s / 60)} min`;
}

type Phase = "idle" | "subiendo" | "pausada" | "reintentando" | "procesando" | "error";

export function ChunkedUploadForm({
  action,
  projectId,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  projectId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [progress, setProgress] = React.useState<UploadProgress | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const handleRef = React.useRef<ChunkedHandle | null>(null);
  // Lo necesario para «Reintentar» tras un fallo: el archivo y el FormData ya capturados.
  const retryRef = React.useRef<{ form: HTMLFormElement; fd: FormData; file: File } | null>(null);
  const busy = phase === "subiendo" || phase === "pausada" || phase === "reintentando" || phase === "procesando";

  // Con subida en curso, avisar antes de cerrar la pestaña (se perdería el avance local).
  React.useEffect(() => {
    if (!busy) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);

  const uploadBig = async (form: HTMLFormElement, fd: FormData, file: File) => {
    setError(null);
    setProgress(null);
    setPhase("subiendo");
    retryRef.current = { form, fd, file };
    try {
      // Duración + poster: VideoUploadField ya los dejó en los ocultos del formulario (mismas
      // capturas del flujo clásico); si el envío llegó antes de que terminara de generarlos,
      // se completan aquí con probeVideo.
      if (!String(fd.get("durationSec") ?? "").trim()) {
        const { durationSec, poster } = await probeVideo(file);
        if (durationSec) fd.set("durationSec", String(durationSec));
        if (poster && !String(fd.get("poster") ?? "").trim()) fd.set("poster", poster);
      }

      const handle = startChunkedUpload(file, {
        projectId,
        onProgress: setProgress,
        // Solo transiciona entre estados VIVOS de la subida: un evento tardío no debe pisar
        // "procesando"/"error"/"idle".
        onStateChange: (s) => setPhase((p) => (p === "subiendo" || p === "pausada" || p === "reintentando" ? s : p)),
      });
      handleRef.current = handle;
      const { uploadId, crc32 } = await handle.done;

      setPhase("procesando");
      // La MISMA server action de siempre, con la referencia en lugar de los bytes.
      fd.delete("file");
      fd.set("chunkUploadId", uploadId);
      fd.set("chunkCrc32", crc32);
      const res = await action(fd);
      if (res && typeof res === "object" && res.error) throw new Error(res.error);

      // Éxito: mismo desenlace que el envío clásico (formulario limpio; la revalidación
      // de la action refresca la lista de entregables).
      form.reset();
      retryRef.current = null;
      handleRef.current = null;
      setProgress(null);
      setPhase("idle");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Falló la subida.");
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const form = e.currentTarget;
    if (busy) {
      e.preventDefault();
      return;
    }
    const fd = new FormData(form);
    const file = fd.get("file");
    // Camino clásico intacto para pequeños (o sin archivo): sigue la server action del form.
    if (!(file instanceof File) || file.size <= THRESHOLD) return;
    e.preventDefault();
    void uploadBig(form, fd, file);
  };

  const cancelOrDismiss = async () => {
    await handleRef.current?.cancel();
    handleRef.current = null;
    retryRef.current = null;
    setProgress(null);
    setError(null);
    setPhase("idle");
  };

  return (
    // El action va envuelto para tipar Promise<void> (el retorno { error } solo lo usa el
    // camino por trozos; el envío clásico lo ignora, como cualquier form action).
    <form
      action={async (fd: FormData) => {
        await action(fd);
      }}
      onSubmit={onSubmit}
      className={className}
    >
      {children}

      {busy || phase === "error" ? (
        <div className="w-full space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", phase === "error" ? "bg-destructive" : "bg-primary")}
              style={{ width: `${phase === "procesando" ? 100 : progress?.pct ?? 0}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              <b className="text-foreground">{phase === "procesando" ? 100 : progress?.pct ?? 0}%</b>
              {progress ? ` · ${fmtBytes(progress.sent)} de ${fmtBytes(progress.total)}` : ""}
            </span>
            <span>
              {phase === "procesando"
                ? "Verificando y registrando…"
                : phase === "reintentando"
                  ? "Conexión inestable — reintentando…"
                  : phase === "pausada"
                    ? "En pausa"
                    : phase === "error"
                      ? "La subida no terminó"
                      : progress?.speedBps
                        ? `${fmtBytes(progress.speedBps)}/s · ${fmtEta(progress.etaSec)}`
                        : "Subiendo por trozos…"}
            </span>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex items-center gap-2">
            {phase === "subiendo" || phase === "reintentando" ? (
              <button type="button" onClick={() => handleRef.current?.pause()} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
                <Pause className="size-3.5" /> Pausar
              </button>
            ) : null}
            {phase === "pausada" ? (
              <button type="button" onClick={() => handleRef.current?.resume()} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                <Play className="size-3.5" /> Reanudar
              </button>
            ) : null}
            {phase === "error" && retryRef.current ? (
              <button
                type="button"
                onClick={() => {
                  const r = retryRef.current;
                  if (r) void uploadBig(r.form, r.fd, r.file);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Reintentar
              </button>
            ) : null}
            {phase !== "procesando" ? (
              <button type="button" onClick={() => void cancelOrDismiss()} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-destructive">
                <X className="size-3.5" /> Cancelar
              </button>
            ) : (
              <Loader2 className="size-4 animate-spin opacity-60" />
            )}
            {busy && phase !== "procesando" ? (
              <span className="ml-auto text-[11px] text-muted-foreground">Archivo grande: va por trozos — no cierres esta pestaña.</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}
