"use client";

import * as React from "react";
import { Download, Trash2, Loader2, ChevronRight, Plus } from "lucide-react";
import { getRenditions, addRendition, deleteRendition, type RenditionRow } from "./deliverable-rendition-actions";
import { RENDITION_FORMATS, renditionFormatLabel } from "@/lib/rendition-format";

// Centro de descargas por formato de un entregable (renditions) para el equipo. Vive dentro del
// panel de entregables (server component): al desplegar por primera vez carga los enlaces con la
// server action. El equipo adjunta un enlace de descarga por formato (Reel, TikTok, Shorts, web…)
// y el cliente los ve en su sala como "Archivos finales".
export function DeliverableRenditions({ deliverableId }: { deliverableId: string }) {
  const [open, setOpen] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [rows, setRows] = React.useState<RenditionRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [format, setFormat] = React.useState(RENDITION_FORMATS[0]?.key ?? "OTRO");
  const [url, setUrl] = React.useState("");
  const [label, setLabel] = React.useState("");

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      try {
        const r = await getRenditions(deliverableId);
        setRows(r);
        setLoaded(true);
      } catch {
        setError("No se pudieron cargar los archivos.");
      } finally {
        setLoading(false);
      }
    }
  }

  function add() {
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Añade un enlace de descarga.");
      return;
    }
    start(async () => {
      try {
        await addRendition(deliverableId, format, trimmed, label);
        const r = await getRenditions(deliverableId);
        setRows(r);
        setUrl("");
        setLabel("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo añadir.");
      }
    });
  }

  function remove(id: string) {
    setError(null);
    start(async () => {
      try {
        await deleteRendition(id);
        setRows((prev) => prev.filter((x) => x.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo eliminar.");
      }
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-border">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold hover:bg-muted/40"
      >
        <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <Download className="size-3.5 shrink-0" />
        <span>Archivos finales por formato</span>
        {rows.length > 0 ? (
          <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{rows.length}</span>
        ) : (
          <span className="text-[11px] font-normal text-muted-foreground">· un enlace de descarga por formato</span>
        )}
      </button>

      {open ? (
        <div className="space-y-2.5 px-3 pb-3">
          {loading ? (
            <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Cargando…</p>
          ) : (
            <>
              {rows.length > 0 ? (
                <ul className="space-y-1.5">
                  {rows.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs">
                      <span className="shrink-0 font-medium text-foreground">
                        {renditionFormatLabel(r.format)}
                        {r.label ? <span className="font-normal text-muted-foreground"> · {r.label}</span> : null}
                      </span>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-muted-foreground hover:text-foreground hover:underline"
                        title={r.url}
                      >
                        {r.url}
                      </a>
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        disabled={pending}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-60"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-1 text-[11px] text-muted-foreground">Aún no hay archivos. Añade el primer formato abajo.</p>
              )}

              <div className="space-y-1.5 rounded-md border border-input bg-muted/30 p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                  >
                    {RENDITION_FORMATS.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Enlace de descarga (Drive / MP4 / URL)"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Etiqueta opcional (1080×1920)"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={add}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                    Añadir
                  </button>
                </div>
              </div>

              {error ? <span className="text-xs text-destructive">{error}</span> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
