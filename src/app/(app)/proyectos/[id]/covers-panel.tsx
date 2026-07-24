"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ImagePlus, Link2, Link2Off, Trash2, Copy, Check, Ban, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/submit-button";
import { uploadProjectCovers, linkProjectCover, deleteProjectCover, setCoversRevoked } from "./covers-actions";

// ── Pestaña «Portadas»: banco del proyecto ──
// Las portadas viven aparte de los videos: se suben antes o después, se entregan al cliente
// por su propio enlace (/portadas/[token]) y se vinculan a un video en cualquier momento.

export type CoverItem = {
  id: string;
  name: string;
  src: string; // miniatura (token firmado en el servidor)
  full: string; // original / descarga
  deliverable: { id: string; number: number | null; name: string } | null;
  decision: string | null; // APROBADA | CAMBIOS | DESCARTADA | null
  decisionBy: string | null;
  decisionNote: string | null;
};

export type CoverTarget = { id: string; number: number | null; name: string; type: string; status: string };

// Parecido de nombres (sugerir el video correcto): palabras compartidas tras normalizar.
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.[a-z0-9]+$/i, "");
}
function similarity(cover: string, target: string): number {
  const a = new Set(norm(cover).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const b = new Set(norm(target).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  let hits = 0;
  for (const w of a) if (b.has(w)) hits++;
  return hits;
}

function decisionBadge(c: CoverItem): { label: string; cls: string } {
  if (c.decision === "APROBADA") return { label: "✓ Aprobada", cls: "bg-emerald-600 text-white" };
  if (c.decision === "CAMBIOS") return { label: "✎ Cambios", cls: "bg-amber-600 text-white" };
  if (c.decision === "DESCARTADA") return { label: "Descartada", cls: "bg-zinc-500 text-white" };
  if (c.deliverable) return { label: `→ #${c.deliverable.number ?? "?"}`, cls: "bg-primary text-primary-foreground" };
  return { label: "Sin vincular", cls: "bg-background/90 text-muted-foreground" };
}

export function CoversPanel({
  projectId,
  canManage,
  canUpload,
  covers,
  targets,
  clientUrl,
  revoked,
}: {
  projectId: string;
  canManage: boolean;
  canUpload: boolean;
  covers: CoverItem[];
  targets: CoverTarget[];
  clientUrl: string;
  revoked: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  const [picker, setPicker] = React.useState<CoverItem | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clientUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* portapapeles no disponible */ }
  };

  return (
    <div className="space-y-4">
      {/* Barra: subir + enlace del cliente */}
      <div className="flex flex-wrap items-center gap-2">
        {canUpload ? (
          <form action={uploadProjectCovers.bind(null, projectId)} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
            <ImagePlus className="size-4 text-muted-foreground" />
            <input type="file" name="covers" accept="image/*" multiple required className="max-w-56 text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs" />
            <SubmitButton pendingText="Subiendo…" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Subir portadas</SubmitButton>
          </form>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={copy} disabled={revoked} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />} {copied ? "Copiado" : "Copiar enlace del cliente"}
          </button>
          {canManage ? (
            <form action={setCoversRevoked.bind(null, projectId, !revoked)}>
              <SubmitButton pendingText="…" className={cn("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium", revoked ? "border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10" : "border-border text-muted-foreground hover:bg-accent")}>
                <Ban className="size-3.5" /> {revoked ? "Reactivar enlace" : "Revocar enlace"}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>
      {revoked ? <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">El enlace del cliente está revocado: no puede ver ni decidir portadas hasta reactivarlo.</p> : null}

      {covers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          El banco está vacío. Sube portadas aquí (pueden llegar ANTES que los videos) y vincúlalas cuando la pieza exista.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {covers.map((c) => {
            const badge = decisionBadge(c);
            return (
              <div key={c.id} className="group overflow-hidden rounded-xl border border-border bg-card">
                <a href={c.full} target="_blank" rel="noreferrer" title={`Ver ${c.name}`} className="relative block bg-muted/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.src} alt={c.name} loading="lazy" className="aspect-[9/16] w-full object-cover" />
                  <span className={cn("absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold", badge.cls)}>{badge.label}</span>
                </a>
                <div className="space-y-1.5 p-2">
                  <p className="truncate text-xs font-semibold" title={c.name}>{c.name}</p>
                  {c.deliverable ? (
                    <p className="truncate text-[11px] text-muted-foreground" title={c.deliverable.name}>→ #{c.deliverable.number ?? "?"} {c.deliverable.name}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Suelta · entregable aparte</p>
                  )}
                  {c.decision === "CAMBIOS" && c.decisionNote ? (
                    <p className="line-clamp-2 text-[11px] text-amber-700 dark:text-amber-300" title={c.decisionNote}>«{c.decisionNote}»</p>
                  ) : null}
                  {canUpload ? (
                    <div className="flex items-center gap-1 pt-0.5">
                      <button type="button" onClick={() => setPicker(c)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border px-1.5 py-1 text-[11px] font-medium hover:bg-accent">
                        <Link2 className="size-3" /> {c.deliverable ? "Cambiar" : "Vincular"}
                      </button>
                      {c.deliverable ? (
                        <form action={linkProjectCover.bind(null, c.id, projectId, null)}>
                          <SubmitButton pendingText="…" title="Desvincular del video" className="inline-flex items-center rounded-md border border-border px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent">
                            <Link2Off className="size-3" />
                          </SubmitButton>
                        </form>
                      ) : null}
                      {canManage ? (
                        <form
                          action={deleteProjectCover.bind(null, c.id, projectId)}
                          onSubmit={(e) => { if (!window.confirm(`¿Borrar la portada «${c.name}»? El cliente dejará de verla.`)) e.preventDefault(); }}
                        >
                          <SubmitButton pendingText="…" title="Borrar portada" className="inline-flex items-center rounded-md border border-border px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="size-3" />
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selector de vínculo (portal: por encima de todo, nada lo recorta) */}
      {picker
        ? createPortal(
            <>
              <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPicker(null)} />
              <div className="fixed left-1/2 top-1/2 z-50 w-[26rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <p className="text-sm font-semibold">🔗 Vincular «{picker.name}» a…</p>
                  <button type="button" onClick={() => setPicker(null)} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
                </div>
                <div className="max-h-80 overflow-y-auto p-1">
                  {targets.length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">Este proyecto aún no tiene videos. Sube el video y vuelve aquí para vincular.</p>
                  ) : (
                    [...targets]
                      .sort((a, b) => similarity(picker.name, b.name) - similarity(picker.name, a.name))
                      .map((t, i) => {
                        const sug = i === 0 && similarity(picker.name, t.name) > 0;
                        return (
                          <form key={t.id} action={linkProjectCover.bind(null, picker.id, projectId, t.id)} onSubmit={() => setPicker(null)}>
                            <SubmitButton pendingText="Vinculando…" className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted", sug && "bg-primary/5")}>
                              <span className="text-muted-foreground">#{t.number ?? "?"}</span>
                              <span className="min-w-0 flex-1 truncate">{t.name}</span>
                              {sug ? <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Sugerido</span> : null}
                            </SubmitButton>
                          </form>
                        );
                      })
                  )}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
