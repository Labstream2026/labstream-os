"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Crown, Download, Loader2, Pencil, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverThumb, CoverViewer, type ViewerCover } from "@/components/covers/cover-viewer";
import { CoverAnnotator } from "@/components/covers/cover-annotator";
import { addCoverNote, chooseCoverWinner, decideBankCover, undoCoverDecision } from "./actions";

// Galería del cliente: grupos por video (2+ portadas = A/B con «Elegir esta») y sueltas.
// El nombre del cliente se pide una vez y se recuerda en el dispositivo.
//
// Cambios de la 2.0: la portada se ve COMPLETA (sin recorte) y se abre a pantalla completa con
// zoom y comparación A/B; se puede DIBUJAR encima para señalar el cambio; las decisiones se
// pintan al instante (optimista) y se pueden DESHACER.

export type CoverNoteView = { id: string; authorName: string; body: string | null; drawing: string | null; resolved: boolean; when: string };
export type PublicCover = {
  id: string;
  name: string;
  src: string;
  full: string;
  decision: string | null; // APROBADA | CAMBIOS | DESCARTADA | null
  decisionBy: string | null;
  decisionNote: string | null;
  notes: CoverNoteView[];
};
export type CoverGroup = { deliverable: { number: number | null; name: string } | null; covers: PublicCover[] };

const NAME_KEY = "portadas:nombre";

function badge(decision: string | null): { label: string; cls: string } | null {
  if (decision === "APROBADA") return { label: "✓ Aprobada", cls: "bg-emerald-600 text-white" };
  if (decision === "CAMBIOS") return { label: "✎ Cambios pedidos", cls: "bg-amber-600 text-white" };
  if (decision === "DESCARTADA") return { label: "Descartada", cls: "bg-zinc-600 text-white" };
  return null;
}

export function CoversGallery({ token, groups }: { token: string; groups: CoverGroup[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null);
  const [changes, setChanges] = React.useState<PublicCover | null>(null); // modal de nota rápida
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  // Visor: qué grupo y qué índice. El grupo define las flechas y el modo comparar.
  const [viewer, setViewer] = React.useState<{ gi: number; i: number } | null>(null);
  const [annotating, setAnnotating] = React.useState<string | null>(null); // coverId
  // Capa optimista: decisiones aplicadas en pantalla antes de que el servidor conteste.
  const [optimistic, setOptimistic] = React.useState<Record<string, string | null>>({});
  // Los overlays van por portal a <body>: la sala tiene ancestros con backdrop-blur, que
  // crean bloque contenedor y romperían el `fixed` a pantalla completa. Solo se montan tras
  // un clic, nunca en el HTML del servidor.
  const host = typeof document === "undefined" ? null : document.body;

  React.useEffect(() => {
    setName(window.localStorage.getItem(NAME_KEY) ?? "");
  }, []);
  const saveName = (v: string) => {
    setName(v);
    window.localStorage.setItem(NAME_KEY, v);
  };

  const decisionOf = (c: PublicCover) => (c.id in optimistic ? optimistic[c.id] : c.decision);

  const run = async (coverId: string, optimisticValue: string | null | undefined, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setPending(coverId);
    setError(null);
    if (optimisticValue !== undefined) setOptimistic((o) => ({ ...o, [coverId]: optimisticValue }));
    try {
      const r = await fn();
      if (!r.ok) {
        setError(r.message ?? "No se pudo guardar. Intenta de nuevo.");
        setOptimistic((o) => {
          const next = { ...o };
          delete next[coverId];
          return next;
        });
      } else {
        router.refresh();
      }
    } finally {
      setPending(null);
    }
  };

  const approve = (c: PublicCover) => run(c.id, "APROBADA", () => decideBankCover(token, c.id, "APROBADA", name));
  const undo = (c: PublicCover) => run(c.id, null, () => undoCoverDecision(token, c.id));
  const winner = (c: PublicCover, group: PublicCover[]) => {
    // Optimista también para las hermanas del grupo A/B.
    setOptimistic((o) => {
      const next = { ...o, [c.id]: "APROBADA" };
      for (const s of group) if (s.id !== c.id) next[s.id] = "DESCARTADA";
      return next;
    });
    return run(c.id, undefined, () => chooseCoverWinner(token, c.id, name));
  };
  const sendChanges = () => {
    if (!changes) return;
    const c = changes;
    setChanges(null);
    void run(c.id, "CAMBIOS", () => addCoverNote(token, c.id, { body: note, name })).then(() => setNote(""));
  };
  const sendAnnotation = (coverId: string, drawing: string | null, body: string) => {
    setAnnotating(null);
    void run(coverId, "CAMBIOS", () => addCoverNote(token, coverId, { body, drawing, name }));
  };

  // Barra de avance (mejora 2): cuántas quedan por decidir.
  const all = groups.flatMap((g) => g.covers);
  const decided = all.filter((c) => decisionOf(c) !== null).length;

  const openViewer = (gi: number, i: number) => setViewer({ gi, i });
  const viewerGroup = viewer ? groups[viewer.gi] : null;
  const viewerCovers: ViewerCover[] = (viewerGroup?.covers ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    src: c.src,
    download: decisionOf(c) === "APROBADA" ? c.full : null,
    badge: badge(decisionOf(c)),
    caption: c.decisionBy && decisionOf(c) ? `${decisionOf(c) === "APROBADA" ? "Aprobó" : "Decidió"}: ${c.decisionBy}` : null,
  }));
  const currentCover = viewer && viewerGroup ? viewerGroup.covers[viewer.i] : null;

  return (
    <div className="space-y-8">
      {/* Nombre (una vez) + avance */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
        <p className="text-sm text-muted-foreground">Tu nombre (aparece en cada decisión):</p>
        <input
          value={name}
          onChange={(e) => saveName(e.target.value)}
          placeholder="Escribe tu nombre…"
          className="min-w-44 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-64"
        />
        <span className="ml-auto shrink-0 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
          {decided} de {all.length} decididas
        </span>
      </div>
      {error ? <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {groups.map((g, gi) => {
        const isAB = Boolean(g.deliverable) && g.covers.length > 1;
        const hasWinner = isAB && g.covers.some((c) => decisionOf(c) === "APROBADA");
        return (
          <section key={gi}>
            <h2 className="mb-1 text-base font-bold tracking-tight">
              {g.deliverable ? (
                <>
                  {g.deliverable.number ? <span className="mr-1 text-muted-foreground">#{g.deliverable.number}</span> : null}
                  {g.deliverable.name}
                </>
              ) : (
                "Portadas sueltas"
              )}
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              {isAB
                ? hasWinner
                  ? "Ya elegiste la ganadora. Puedes descargarla abajo."
                  : `${g.covers.length} opciones para este video — ábrelas en grande y compáralas antes de elegir.`
                : g.deliverable
                  ? "La portada de este video: ábrela en grande, apruébala o marca los cambios sobre la imagen."
                  : "Se entregan aparte (su video llega después). Apruébalas o marca los cambios."}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {g.covers.map((c, i) => {
                const dec = decisionOf(c);
                const b = badge(dec);
                const busy = pending === c.id;
                const decided = dec === "APROBADA" || dec === "DESCARTADA";
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "overflow-hidden rounded-xl border bg-card transition-colors",
                      dec === "APROBADA" ? "border-emerald-500/60" : "border-border",
                      dec === "DESCARTADA" && "opacity-55",
                    )}
                  >
                    <div className="relative">
                      <CoverThumb src={c.src} alt={c.name} onClick={() => openViewer(gi, i)} />
                      {b ? <span className={cn("pointer-events-none absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold", b.cls)}>{b.label}</span> : null}
                      {c.notes.length > 0 ? (
                        <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold text-white">
                          ✏️ {c.notes.length}
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1.5 p-2.5">
                      <p className="truncate text-xs font-semibold" title={c.name}>{c.name}</p>
                      {dec === "CAMBIOS" && c.decisionNote ? (
                        <p className="line-clamp-2 text-[11px] text-amber-300" title={c.decisionNote}>«{c.decisionNote}»</p>
                      ) : null}
                      {c.decisionBy && decided ? (
                        <p className="text-[10.5px] text-muted-foreground">{dec === "APROBADA" ? "Aprobó" : "Decidió"}: {c.decisionBy}</p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {isAB ? (
                          dec !== "APROBADA" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => winner(c, g.covers)}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                            >
                              {busy ? <Loader2 className="size-3 animate-spin" /> : <Crown className="size-3" />} Elegir esta
                            </button>
                          ) : null
                        ) : dec !== "APROBADA" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => approve(c)}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
                          >
                            {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Aprobar
                          </button>
                        ) : null}
                        {dec !== "APROBADA" && dec !== "DESCARTADA" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setAnnotating(c.id)}
                            title="Dibujar sobre la portada"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
                          >
                            <Pencil className="size-3" /> Anotar
                          </button>
                        ) : null}
                        {decided ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => undo(c)}
                            title="Deshacer mi decisión"
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
                          >
                            <RotateCcw className="size-3" /> Deshacer
                          </button>
                        ) : null}
                        {dec === "APROBADA" ? (
                          <a href={c.full} download className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-emerald-500/50 px-2 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/10">
                            <Download className="size-3" /> Descargar
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Visor a pantalla completa */}
      {viewer && viewerGroup && currentCover ? (
        <CoverViewer
          covers={viewerCovers}
          index={viewer.i}
          onIndexChange={(i) => setViewer({ gi: viewer.gi, i })}
          onClose={() => setViewer(null)}
          compareLabel="Comparar opciones"
          actions={(vc) => {
            const c = viewerGroup.covers.find((x) => x.id === vc.id);
            if (!c) return null;
            const dec = decisionOf(c);
            const isAB = Boolean(viewerGroup.deliverable) && viewerGroup.covers.length > 1;
            const busy = pending === c.id;
            return (
              <>
                {dec !== "APROBADA" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => (isAB ? winner(c, viewerGroup.covers) : approve(c))}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : isAB ? <Crown className="size-4" /> : <Check className="size-4" />}
                    {isAB ? "Elegir esta" : "Aprobar"}
                  </button>
                ) : null}
                {dec !== "APROBADA" && dec !== "DESCARTADA" ? (
                  <button
                    type="button"
                    onClick={() => setAnnotating(c.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    <Pencil className="size-4" /> Anotar sobre la portada
                  </button>
                ) : null}
                {dec === "APROBADA" || dec === "DESCARTADA" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => undo(c)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                  >
                    <RotateCcw className="size-4" /> Deshacer
                  </button>
                ) : null}
              </>
            );
          }}
          extra={(vc) => {
            const c = viewerGroup.covers.find((x) => x.id === vc.id);
            if (!c || c.notes.length === 0) return null;
            return (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/50">Notas de esta portada</p>
                <div className="space-y-3">
                  {c.notes.map((n) => (
                    <div key={n.id} className={cn("border-l-2 pl-2.5", n.resolved ? "border-emerald-500/50 opacity-70" : "border-primary/60")}>
                      <p className="text-[10.5px] text-white/45">{n.authorName} · {n.when}</p>
                      {n.body ? <p className="text-xs text-white/90">{n.body}</p> : null}
                      {n.drawing ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.drawing} alt="Anotación" className="mt-1.5 w-24 rounded border border-white/10" />
                      ) : null}
                      {n.resolved ? <span className="mt-1 inline-block rounded bg-emerald-500/15 px-1.5 text-[10px] font-bold text-emerald-400">✓ Resuelta</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          }}
        />
      ) : null}

      {/* Lienzo de anotación */}
      {annotating && host ? (
        (() => {
          const c = groups.flatMap((g) => g.covers).find((x) => x.id === annotating);
          if (!c) return null;
          return createPortal(
            <div role="dialog" aria-modal="true" aria-label={`Anotar ${c.name}`} className="fixed inset-0 z-[130] flex flex-col bg-black/95 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2 text-white">
                <p className="min-w-0 truncate text-sm font-semibold">✏️ Anotar «{c.name}»</p>
                <button
                  type="button"
                  onClick={() => setAnnotating(null)}
                  aria-label="Cerrar"
                  className="ml-auto grid size-8 place-items-center rounded-lg text-white/80 hover:bg-white/15"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto">
                <CoverAnnotator
                  src={c.src}
                  name={c.name}
                  pending={pending === c.id}
                  onSend={(drawing, body) => sendAnnotation(c.id, drawing, body)}
                  onCancel={() => setAnnotating(null)}
                />
              </div>
            </div>,
            host,
          );
        })()
      ) : null}

      {/* Modal de nota rápida (sin dibujo) */}
      {changes ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setChanges(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[24rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">✎ Cambios en «{changes.name}»</p>
              <button type="button" onClick={() => setChanges(null)} className="rounded p-1 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              autoFocus
              placeholder="¿Qué cambiarías? (texto cortado, otro color, otra foto…)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setChanges(null)} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent">Cancelar</button>
              <button type="button" onClick={sendChanges} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500">Enviar</button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
