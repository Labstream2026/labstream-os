"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Pause, Play, X, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { startChunkedUpload, probeVideo, type ChunkedHandle, type UploadProgress } from "@/lib/chunked-upload-client";

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

// ── Subir nueva versión (PRO) ──
// Subida por TROZOS sin límite práctico de tamaño: progreso real (%, velocidad, ETA),
// pausar/reanudar, reintentos automáticos y verificación de integridad (CRC32). La duración
// y la auto-portada se capturan igual que en el formulario clásico. El registro final lo hace
// la MISMA server action de siempre (idénticas notificaciones, compuertas y tareas SLA).
export function UploadVersionCard({
  deliverableId,
  projectId,
  nextNumber,
}: {
  deliverableId: string;
  projectId: string;
  nextNumber: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [notes, setNotes] = React.useState("");
  const [phase, setPhase] = React.useState<"idle" | "subiendo" | "pausada" | "reintentando" | "procesando" | "ok" | "error">("idle");
  const [progress, setProgress] = React.useState<UploadProgress | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [doneVersion, setDoneVersion] = React.useState<number | null>(null);
  const handleRef = React.useRef<ChunkedHandle | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const busy = phase === "subiendo" || phase === "pausada" || phase === "reintentando" || phase === "procesando";

  // Si hay una subida en curso, avisar antes de cerrar la pestaña (se perdería el avance local).
  React.useEffect(() => {
    if (!busy) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy]);

  const reset = () => {
    setFile(null);
    setNotes("");
    setPhase("idle");
    setProgress(null);
    setError(null);
    handleRef.current = null;
  };

  const upload = async () => {
    if (!file || busy) return;
    setError(null);
    setPhase("subiendo");
    try {
      // Duración + fotograma de portada, ANTES de subir (mismas capturas del flujo clásico).
      const { durationSec, poster } = await probeVideo(file);

      const handle = startChunkedUpload(file, {
        projectId,
        onProgress: setProgress,
        onStateChange: (s) => setPhase((p) => (p === "procesando" || p === "ok" || p === "error" ? p : s)),
      });
      handleRef.current = handle;
      const { uploadId, crc32 } = await handle.done;

      setPhase("procesando");
      const res = await fetch(`/api/upload/chunked/${uploadId}/finish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deliverableId, notes, durationSec, poster, crc32 }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error ?? "No se pudo registrar la versión.");
      setDoneVersion(out.version ?? nextNumber);
      setPhase("ok");
      router.refresh();
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Fallo la subida.");
    }
  };

  if (phase === "ok") {
    return (
      <div className="mb-5 flex flex-wrap items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3">
        <CheckCircle2 className="size-5 text-emerald-500" />
        <p className="min-w-52 flex-1 text-sm">
          <b>v{doneVersion} subida, verificada y enviada a revisión.</b>{" "}
          <span className="text-muted-foreground">Notificaciones y tareas de pre-aprobación creadas como siempre.</span>
        </p>
        <button type="button" onClick={reset} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">
          Subir otra
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mb-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <UploadCloud className="size-4" /> Subir nueva versión (v{nextNumber})
        </button>
        <span className="ml-2.5 text-xs text-muted-foreground">Sin límite práctico de tamaño · reanudable · con verificación</span>
      </div>
    );
  }

  return (
    <div className="mb-5 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <UploadCloud className="size-4 text-muted-foreground" /> Nueva versión · v{nextNumber}
        </h3>
        {!busy ? (
          <button type="button" onClick={() => { setOpen(false); reset(); }} aria-label="Cerrar" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed border-border px-4 py-8 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
        >
          <UploadCloud className="size-6" />
          Elige el video (o cualquier archivo) — los masters grandes van por trozos, sin reiniciar nada
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-lg">🎬</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{fmtBytes(file.size)}</p>
            </div>
            {!busy ? (
              <button type="button" onClick={() => setFile(null)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent">
                Cambiar
              </button>
            ) : null}
          </div>

          {/* Aviso previo de archivo gigante: se puede seguir (los trozos lo aguantan). */}
          {file.size > 1.5 * GB && phase === "idle" ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              <span>
                <b>Archivo pesado ({fmtBytes(file.size)}).</b> Se subirá por trozos sin problema, pero tomará su tiempo según tu conexión.
                Consejo: para la REVISIÓN suele bastar un export liviano (1080p); guarda el master para la entrega final.
              </span>
            </p>
          ) : null}

          {phase === "idle" ? (
            <>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder={`¿Qué cambió en la v${nextNumber}? (el cliente lo ve destacado al abrir la sala)`}
                className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={upload}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <UploadCloud className="size-4" /> Subir y enviar a revisión
                </button>
              </div>
            </>
          ) : null}

          {busy || phase === "error" ? (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", phase === "error" ? "bg-destructive" : "bg-primary")}
                  style={{ width: `${progress?.pct ?? 0}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  <b className="text-foreground">{progress?.pct ?? 0}%</b>
                  {progress ? ` · ${fmtBytes(progress.sent)} de ${fmtBytes(progress.total)}` : ""}
                </span>
                <span>
                  {phase === "procesando"
                    ? "Verificando y registrando la versión…"
                    : phase === "reintentando"
                      ? "Conexión inestable — reintentando…"
                      : phase === "pausada"
                        ? "En pausa"
                        : progress?.speedBps
                          ? `${fmtBytes(progress.speedBps)}/s · ${fmtEta(progress.etaSec)}`
                          : "Subiendo…"}
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
                {phase === "error" ? (
                  <button type="button" onClick={upload} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                    Reintentar
                  </button>
                ) : null}
                {phase !== "procesando" ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleRef.current?.cancel();
                      reset();
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <X className="size-3.5" /> Cancelar
                  </button>
                ) : (
                  <Loader2 className="size-4 animate-spin opacity-60" />
                )}
                {busy && phase !== "procesando" ? (
                  <span className="ml-auto text-[11px] text-muted-foreground">Puedes seguir en otra pestaña — no cierres esta.</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.currentTarget.value = "";
          if (f) setFile(f);
        }}
      />
    </div>
  );
}
