"use client";

import * as React from "react";
import { ImagePlus, X, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ImageCropper } from "@/components/image-cropper";
import { saveProjectAppearance, clearProjectCover } from "./appearance-actions";

// Portada del PROYECTO (Resumen → tarjeta). La edición vivía en el CoverBanner de la cabecera
// vieja y quedó sin puerta con la cabecera mínima; vuelve aquí, ya con REENCUADRE + zoom
// (ImageCropper) antes de subir. Solo la ve quien gestiona el proyecto (mismo gate que la action).
export function ProjectCoverCard({ projectId, bannerUrl }: { projectId: string; bannerUrl: string | null }) {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [cropFile, setCropFile] = React.useState<File | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // El «Guardado ✓» se esfuma solo; los errores se quedan hasta el siguiente intento.
  React.useEffect(() => {
    if (!msg?.ok) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  const report = (r: { ok: boolean; error?: string }) =>
    setMsg(r.ok ? { ok: true, text: "Guardado" } : { ok: false, text: r.error ?? "No se pudo guardar." });

  const upload = (f: File) => {
    setMsg(null);
    start(async () => {
      const fd = new FormData();
      fd.set("banner", f);
      report(await saveProjectAppearance(projectId, fd));
    });
  };
  const quitar = () => {
    setMsg(null);
    start(async () => { report(await clearProjectCover(projectId)); });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Portada del proyecto <span className="font-normal text-muted-foreground/70">· ancha (~1600×500) · máx 8MB</span></h3>
        <div className="flex items-center gap-3">
          {pending ? (
            <Loader2 className="size-4 animate-spin opacity-60" />
          ) : msg ? (
            <span className={cn("inline-flex items-center gap-1 text-xs", msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {msg.ok ? <Check className="size-3.5" /> : null}
              {msg.text}
            </span>
          ) : null}
          {bannerUrl ? (
            <button type="button" onClick={quitar} disabled={pending} className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-destructive disabled:opacity-50">
              <X className="size-3" /> Quitar portada
            </button>
          ) : null}
        </div>
      </div>

      <button type="button" onClick={() => inputRef.current?.click()} title="Subir portada (imagen ancha)" className="block w-full overflow-hidden rounded-lg border border-border hover:ring-2 hover:ring-primary/40">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bannerUrl} alt="Portada del proyecto" className="h-28 w-full object-cover" />
        ) : (
          <div className="flex h-28 w-full items-center justify-center bg-muted/40 text-xs text-muted-foreground"><ImagePlus className="mr-1.5 size-4" /> Subir portada</div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.currentTarget.value = ""; // permite re-elegir el mismo archivo
          if (f) setCropFile(f);
        }}
      />

      {cropFile ? (
        <ImageCropper
          file={cropFile}
          aspect={1600 / 500}
          outWidth={1600}
          title="Reencuadrar portada"
          onCancel={() => setCropFile(null)}
          onDone={(f) => { setCropFile(null); upload(f); }}
        />
      ) : null}
    </div>
  );
}
