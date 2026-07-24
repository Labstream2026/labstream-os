"use client";

import * as React from "react";
import { FolderDown, Plus, Copy, Check, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/submit-button";
import { createPhotoSet, importDriveFolderPhotos } from "./covers-actions";

// ── Pestaña «Fotos»: sets del proyecto ──
// Cada set es un entregable FOTOGRAFIA: entrega independiente con su enlace de calificación
// (el cliente marca 👍/👎 + nota desde /review/[token], sin cuenta). Aquí se ven todos los
// sets de un vistazo, se crean nuevos y se importa una carpeta de Drive completa. La gestión
// foto a foto (subir archivos, borrar) sigue en la tarjeta del entregable («En curso»).

export type PhotoSet = {
  id: string;
  number: number | null;
  name: string;
  status: string;
  statusLabel: string;
  reviewUrl: string; // enlace del cliente (firmado en el servidor)
  thumbs: string[]; // hasta 6 miniaturas firmadas
  total: number;
  liked: number;
  disliked: number;
  hasDrive: boolean;
  hasLocal: boolean;
};

function CopyBtn({ url }: { url: string }) {
  const [ok, setOk] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(url); setOk(true); window.setTimeout(() => setOk(false), 1800); } catch { /* sin portapapeles */ }
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent"
    >
      {ok ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />} {ok ? "Copiado" : "Enlace del cliente"}
    </button>
  );
}

// Importar carpeta de Drive con resultado visible (añadidas / error) sin recargar a ciegas.
function DriveImport({ projectId, setId }: { projectId: string; setId: string }) {
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = React.useTransition();
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const r = await importDriveFolderPhotos(projectId, setId, fd);
          setMsg(r.ok ? { ok: true, text: `Importadas ${r.added ?? 0} foto(s) de la carpeta.` } : { ok: false, text: r.error ?? "No se pudo importar." });
        })
      }
      className="space-y-1"
    >
      <div className="flex items-center gap-1.5">
        <input name="folderUrl" required placeholder="Enlace de carpeta de Drive…" className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-ring" />
        <button type="submit" disabled={pending} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50">
          <FolderDown className="size-3" /> {pending ? "Importando…" : "Importar"}
        </button>
      </div>
      {msg ? <p className={cn("text-[11px]", msg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-destructive")}>{msg.text}</p> : null}
    </form>
  );
}

export function PhotosPanel({ projectId, canUpload, sets }: { projectId: string; canUpload: boolean; sets: PhotoSet[] }) {
  return (
    <div className="space-y-4">
      {canUpload ? (
        <form action={async (fd) => { await createPhotoSet(projectId, fd); }} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
          <Camera className="size-4 text-muted-foreground" />
          <input name="name" required placeholder="Nombre del nuevo set (p. ej. «Sesión consultorio — julio»)" className="min-w-52 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring" />
          <SubmitButton pendingText="Creando…" className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-3.5" /> Nuevo set
          </SubmitButton>
        </form>
      ) : null}

      {sets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Aún no hay sets de fotos. Crea uno arriba y llénalo subiendo archivos (en su tarjeta) o importando una carpeta de Drive.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sets.map((s) => {
            const pending = s.total - s.liked - s.disliked;
            return (
              <div key={s.id} className="overflow-hidden rounded-xl border border-border bg-card">
                {s.thumbs.length > 0 ? (
                  <div className="grid grid-cols-3 gap-0.5 bg-muted/40">
                    {s.thumbs.slice(0, 6).map((t, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={t} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                    ))}
                  </div>
                ) : (
                  <div className="flex aspect-[3/1] items-center justify-center bg-muted/40 text-xs text-muted-foreground">Set vacío</div>
                )}
                <div className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold" title={s.name}>{s.number ? <span className="mr-1 text-muted-foreground">#{s.number}</span> : null}{s.name}</p>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s.statusLabel}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-medium">{s.total} fotos</span>
                    {s.hasDrive ? <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-300">▲ Drive</span> : null}
                    {s.hasLocal ? <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">NAS</span> : null}
                    {s.liked > 0 ? <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">♥ {s.liked}</span> : null}
                    {s.disliked > 0 ? <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">✗ {s.disliked}</span> : null}
                    {pending > 0 ? <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">{pending} sin calificar</span> : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CopyBtn url={s.reviewUrl} />
                    <a href={s.reviewUrl} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent">Ver como cliente ↗</a>
                  </div>
                  {canUpload ? <DriveImport projectId={projectId} setId={s.id} /> : null}
                  <p className="text-[10.5px] text-muted-foreground">Subir archivos o borrar fotos: en su tarjeta de «En curso».</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
