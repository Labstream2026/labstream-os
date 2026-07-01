"use client";

import { RENDITION_FORMATS, renditionFormatLabel } from "@/lib/rendition-format";
import { Download, ExternalLink } from "lucide-react";

// Centro de descargas del cliente: los archivos finales por formato (Reel, TikTok, Shorts,
// web, streaming…). Cada fila es un enlace directo a la descarga. Ordenamos por el orden
// canónico de RENDITION_FORMATS; los formatos desconocidos quedan al final.
export type Rendition = { id: string; format: string; label: string | null; url: string };

export function DownloadCenter({ renditions }: { renditions: Rendition[] }) {
  if (!renditions.length) return null;

  const orderIndex = (format: string) => {
    const i = RENDITION_FORMATS.findIndex((f) => f.key === format);
    return i === -1 ? RENDITION_FORMATS.length : i;
  };
  const ordered = [...renditions].sort((a, b) => orderIndex(a.format) - orderIndex(b.format));

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Archivos finales</h2>
        <p className="text-xs text-muted-foreground">Descarga cada formato, listo para publicar.</p>
      </div>
      <div className="space-y-2 p-4">
        {ordered.map((r) => (
          <a
            key={r.id}
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-foreground transition-colors hover:bg-accent"
          >
            <Download className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{renditionFormatLabel(r.format)}</span>
              {r.label ? (
                <span className="ml-1.5 text-xs text-muted-foreground">{r.label}</span>
              ) : null}
            </span>
            <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </section>
  );
}
