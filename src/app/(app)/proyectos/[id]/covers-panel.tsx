"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ImagePlus, Link2, Link2Off, Trash2, Copy, Check, Ban, X, ChevronLeft, ChevronRight, ExternalLink, Loader2, CloudDownload } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/submit-button";
import { CoverThumb, CoverViewer, type ViewerCover } from "@/components/covers/cover-viewer";
import { WhatsappSend } from "./whatsapp-send";
import {
  uploadProjectCovers,
  linkProjectCover,
  deleteProjectCover,
  setCoversRevoked,
  renameProjectCover,
  moveProjectCover,
  resolveCoverNote,
  importDriveCovers,
} from "./covers-actions";

// ── Pestaña «Portadas»: banco del proyecto ──
// Las portadas viven aparte de los videos: se suben antes o después, se entregan al cliente
// por su propio enlace (/portadas/[token]) y se vinculan a un video en cualquier momento.
// 2.0: visor a pantalla completa (el mismo del cliente), filtros con contadores, orden y
// nombre editables, importación de Drive, y las ANOTACIONES del cliente con su dibujo.

export type CoverNoteItem = { id: string; authorName: string; body: string | null; drawing: string | null; resolved: boolean; when: string };
export type CoverItem = {
  id: string;
  name: string;
  src: string; // miniatura (token firmado en el servidor)
  full: string; // original / descarga
  deliverable: { id: string; number: number | null; name: string } | null;
  decision: string | null; // APROBADA | CAMBIOS | DESCARTADA | null
  decisionBy: string | null;
  decisionNote: string | null;
  notes: CoverNoteItem[];
};

export type CoverTarget = { id: string; number: number | null; name: string; type: string; status: string };

type FilterKey = "todas" | "pendientes" | "aprobadas" | "cambios" | "sueltas";

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

const matches = (c: CoverItem, f: FilterKey) =>
  f === "todas" ||
  (f === "pendientes" && !c.decision) ||
  (f === "aprobadas" && c.decision === "APROBADA") ||
  (f === "cambios" && c.decision === "CAMBIOS") ||
  (f === "sueltas" && !c.deliverable);

export function CoversPanel({
  projectId,
  canManage,
  canUpload,
  covers,
  targets,
  clientUrl,
  revoked,
  projectName = "",
  whatsappEnabled = false,
  clientPhone = "",
}: {
  projectId: string;
  canManage: boolean;
  canUpload: boolean;
  covers: CoverItem[];
  targets: CoverTarget[];
  clientUrl: string;
  revoked: boolean;
  projectName?: string;
  whatsappEnabled?: boolean;
  clientPhone?: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const [picker, setPicker] = React.useState<CoverItem | null>(null);
  const [filter, setFilter] = React.useState<FilterKey>("todas");
  const [viewerIdx, setViewerIdx] = React.useState<number | null>(null);
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [busy, startTransition] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [driveOpen, setDriveOpen] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(clientUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* portapapeles no disponible */ }
  };

  const counts: Record<FilterKey, number> = {
    todas: covers.length,
    pendientes: covers.filter((c) => !c.decision).length,
    aprobadas: covers.filter((c) => c.decision === "APROBADA").length,
    cambios: covers.filter((c) => c.decision === "CAMBIOS").length,
    sueltas: covers.filter((c) => !c.deliverable).length,
  };
  const openNotes = covers.reduce((n, c) => n + c.notes.filter((x) => !x.resolved).length, 0);

  const visible = covers.filter((c) => matches(c, filter));
  const viewerCovers: ViewerCover[] = visible.map((c) => ({
    id: c.id,
    name: c.name,
    src: c.src,
    download: c.full,
    badge: decisionBadge(c),
    caption: c.deliverable ? `→ #${c.deliverable.number ?? "?"} ${c.deliverable.name}` : "Sin vincular",
  }));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) =>
    startTransition(async () => {
      const r = await fn();
      setMsg(r.ok ? (okText ? { ok: true, text: okText } : null) : { ok: false, text: r.error ?? "No se pudo." });
      router.refresh();
    });

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "todas", label: "Todas" },
    { key: "pendientes", label: "Pendientes" },
    { key: "aprobadas", label: "Aprobadas" },
    { key: "cambios", label: "Con cambios" },
    { key: "sueltas", label: "Sin vincular" },
  ];

  return (
    <div className="space-y-4">
      {/* Barra: subir + enlace del cliente */}
      <div className="flex flex-wrap items-center gap-2">
        {canUpload ? (
          <form
            action={async (fd: FormData) => {
              const r = await uploadProjectCovers(projectId, fd);
              setMsg(r.ok ? { ok: true, text: `Subidas ${r.added} portada(s)${r.skipped ? ` · ${r.skipped} descartada(s)` : ""}.` } : { ok: false, text: r.error ?? "No se pudo subir." });
            }}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2"
          >
            <ImagePlus className="size-4 text-muted-foreground" />
            <input type="file" name="covers" accept="image/*" multiple required className="max-w-56 text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs" />
            <SubmitButton pendingText="Subiendo…" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Subir portadas</SubmitButton>
          </form>
        ) : null}
        {canUpload ? (
          <button
            type="button"
            onClick={() => setDriveOpen((v) => !v)}
            className={cn("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent", driveOpen ? "border-primary/50 text-primary" : "border-border")}
          >
            <CloudDownload className="size-3.5" /> Importar de Drive
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <a
            href={clientUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            title="Abrir la sala tal como la ve el cliente"
          >
            <ExternalLink className="size-3.5" /> Ver como cliente
          </a>
          <button type="button" onClick={copy} disabled={revoked} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50">
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />} {copied ? "Copiado" : "Copiar enlace"}
          </button>
          {canManage && !revoked ? (
            <WhatsappSend
              projectId={projectId}
              kind="portadas"
              enabled={whatsappEnabled}
              suggestedPhone={clientPhone}
              fallbackText={`Hola 👋 Te comparto las portadas de «${projectName}» para que las revises: ${clientUrl}`}
            />
          ) : null}
          {canManage ? (
            <form action={setCoversRevoked.bind(null, projectId, !revoked)}>
              <SubmitButton pendingText="…" className={cn("inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium", revoked ? "border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10" : "border-border text-muted-foreground hover:bg-accent")}>
                <Ban className="size-3.5" /> {revoked ? "Reactivar enlace" : "Revocar enlace"}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {driveOpen && canUpload ? (
        <form
          action={async (fd: FormData) => {
            const r = await importDriveCovers(projectId, fd);
            setMsg(r.ok ? { ok: true, text: `Importadas ${r.added} portada(s)${r.skipped ? ` · ${r.skipped} omitida(s)` : ""}.` } : { ok: false, text: r.error ?? "No se pudo importar." });
            if (r.ok) setDriveOpen(false);
          }}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
        >
          <input
            name="folderUrl"
            required
            placeholder="https://drive.google.com/drive/folders/…"
            className="min-w-64 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          <SubmitButton pendingText="Importando…" className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Importar</SubmitButton>
          <p className="w-full text-[11px] text-muted-foreground">La carpeta debe estar compartida como «cualquiera con el enlace». Las imágenes se copian al NAS.</p>
        </form>
      ) : null}

      {msg ? (
        <p className={cn("rounded-md px-3 py-2 text-xs", msg.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive")}>{msg.text}</p>
      ) : null}
      {revoked ? <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">El enlace del cliente está revocado: no puede ver ni decidir portadas hasta reactivarlo.</p> : null}

      {/* Filtros + aviso de anotaciones abiertas */}
      {covers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            if (f.key !== "todas" && counts[f.key] === 0) return null;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFilter(f.key);
                  setViewerIdx(null);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === f.key ? "border-transparent bg-primary/10 text-primary ring-1 ring-primary/40" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label} · {counts[f.key]}
              </button>
            );
          })}
          {openNotes > 0 ? (
            <span className="ml-auto rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              ✏️ {openNotes} {openNotes === 1 ? "anotación sin resolver" : "anotaciones sin resolver"}
            </span>
          ) : null}
        </div>
      ) : null}

      {covers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          El banco está vacío. Sube portadas aquí (pueden llegar ANTES que los videos) y vincúlalas cuando la pieza exista.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {visible.map((c, i) => {
            const badge = decisionBadge(c);
            const idx = covers.findIndex((x) => x.id === c.id);
            const unresolved = c.notes.filter((n) => !n.resolved).length;
            return (
              <div key={c.id} className="group overflow-hidden rounded-xl border border-border bg-card">
                <div className="relative">
                  <CoverThumb src={c.src} alt={c.name} onClick={() => setViewerIdx(i)} />
                  <span className={cn("pointer-events-none absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold", badge.cls)}>{badge.label}</span>
                  {unresolved > 0 ? (
                    <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white">✏️ {unresolved}</span>
                  ) : null}
                  {canUpload && filter === "todas" ? (
                    <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        title="Mover antes"
                        disabled={busy || idx === 0}
                        onClick={() => run(() => moveProjectCover(c.id, projectId, -1))}
                        className="grid size-6 place-items-center rounded-md bg-black/60 text-white hover:bg-black/80 disabled:opacity-30"
                      >
                        <ChevronLeft className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Mover después"
                        disabled={busy || idx === covers.length - 1}
                        onClick={() => run(() => moveProjectCover(c.id, projectId, 1))}
                        className="grid size-6 place-items-center rounded-md bg-black/60 text-white hover:bg-black/80 disabled:opacity-30"
                      >
                        <ChevronRight className="size-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1.5 p-2">
                  {renaming === c.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const v = renameValue;
                        setRenaming(null);
                        run(() => renameProjectCover(c.id, projectId, v));
                      }}
                    >
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                        onBlur={() => setRenaming(null)}
                        className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (!canUpload) return;
                        setRenaming(c.id);
                        setRenameValue(c.name);
                      }}
                      title={canUpload ? "Clic para renombrar" : c.name}
                      className="block w-full truncate text-left text-xs font-semibold hover:text-primary"
                    >
                      {c.name}
                    </button>
                  )}
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
      {covers.length > 0 && visible.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">Nada con ese filtro.</p>
      ) : null}

      {/* Visor a pantalla completa (el mismo que ve el cliente) con las anotaciones al lado */}
      {viewerIdx !== null && visible[viewerIdx] ? (
        <CoverViewer
          covers={viewerCovers}
          index={viewerIdx}
          onIndexChange={setViewerIdx}
          onClose={() => setViewerIdx(null)}
          compareLabel="Comparar"
          extra={(vc) => {
            const c = visible.find((x) => x.id === vc.id);
            if (!c || c.notes.length === 0) return null;
            return (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Anotaciones del cliente</p>
                <div className="space-y-3">
                  {c.notes.map((n) => (
                    <div key={n.id} className={cn("border-l-2 pl-2.5", n.resolved ? "border-emerald-500/50 opacity-70" : "border-amber-500/70")}>
                      <p className="text-[10.5px] text-white/45">{n.authorName} · {n.when}</p>
                      {n.body ? <p className="text-xs text-white/90">{n.body}</p> : null}
                      {n.drawing ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.drawing} alt="Anotación del cliente" className="mt-1.5 w-28 rounded border border-white/10" />
                      ) : null}
                      {canUpload ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => run(() => resolveCoverNote(n.id, projectId, !n.resolved))}
                          className={cn(
                            "mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold",
                            n.resolved ? "bg-emerald-500/15 text-emerald-400" : "border border-white/20 text-white/80 hover:bg-white/10",
                          )}
                        >
                          {busy ? <Loader2 className="size-3 animate-spin" /> : null}
                          {n.resolved ? "✓ Resuelta" : "Marcar hecho"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
          actions={(vc) => {
            const c = visible.find((x) => x.id === vc.id);
            if (!c || !canUpload) return null;
            return (
              <button
                type="button"
                onClick={() => {
                  setViewerIdx(null);
                  setPicker(c);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                <Link2 className="size-4" /> {c.deliverable ? "Cambiar vínculo" : "Vincular a un video"}
              </button>
            );
          }}
        />
      ) : null}

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
