"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Download, Crown, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { decideBankCover, chooseCoverWinner } from "./actions";

// Galería del cliente: grupos por video (2+ portadas = A/B con «Elegir esta») y sueltas.
// El nombre del cliente se pide una vez y se recuerda en el dispositivo.

export type PublicCover = {
  id: string;
  name: string;
  src: string;
  full: string;
  decision: string | null; // APROBADA | CAMBIOS | DESCARTADA | null
  decisionBy: string | null;
  decisionNote: string | null;
};
export type CoverGroup = { deliverable: { number: number | null; name: string } | null; covers: PublicCover[] };

const NAME_KEY = "portadas:nombre";

function badge(c: PublicCover): { label: string; cls: string } | null {
  if (c.decision === "APROBADA") return { label: "✓ Aprobada", cls: "bg-emerald-600 text-white" };
  if (c.decision === "CAMBIOS") return { label: "✎ Cambios pedidos", cls: "bg-amber-600 text-white" };
  if (c.decision === "DESCARTADA") return { label: "Descartada", cls: "bg-zinc-600 text-white" };
  return null;
}

export function CoversGallery({ token, groups }: { token: string; groups: CoverGroup[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState<string | null>(null); // coverId en vuelo
  const [changes, setChanges] = React.useState<PublicCover | null>(null); // modal de «pedir cambios»
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setName(window.localStorage.getItem(NAME_KEY) ?? "");
  }, []);
  const saveName = (v: string) => {
    setName(v);
    window.localStorage.setItem(NAME_KEY, v);
  };

  const run = async (coverId: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setPending(coverId);
    setError(null);
    try {
      const r = await fn();
      if (!r.ok) setError(r.message ?? "No se pudo guardar. Intenta de nuevo.");
      else router.refresh();
    } finally {
      setPending(null);
    }
  };

  const approve = (c: PublicCover) => run(c.id, () => decideBankCover(token, c.id, "APROBADA", name));
  const winner = (c: PublicCover) => run(c.id, () => chooseCoverWinner(token, c.id, name));
  const sendChanges = () => {
    if (!changes) return;
    const c = changes;
    setChanges(null);
    void run(c.id, () => decideBankCover(token, c.id, "CAMBIOS", name, note)).then(() => setNote(""));
  };

  return (
    <div className="space-y-8">
      {/* Nombre (una vez): las decisiones llegan al equipo con tu nombre. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
        <p className="text-sm text-muted-foreground">Tu nombre (aparece en cada decisión):</p>
        <input
          value={name}
          onChange={(e) => saveName(e.target.value)}
          placeholder="Escribe tu nombre…"
          className="min-w-44 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-64"
        />
      </div>
      {error ? <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {groups.map((g, gi) => {
        const isAB = g.deliverable && g.covers.length > 1;
        const hasWinner = isAB && g.covers.some((c) => c.decision === "APROBADA");
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
                  : `${g.covers.length} opciones para este video — toca «Elegir esta» en tu favorita.`
                : g.deliverable
                  ? "La portada de este video: apruébala o pide cambios."
                  : "Se entregan aparte (su video llega después). Apruébalas o pide cambios."}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {g.covers.map((c) => {
                const b = badge(c);
                const busy = pending === c.id;
                const decided = c.decision === "APROBADA" || c.decision === "DESCARTADA";
                return (
                  <div key={c.id} className={cn("overflow-hidden rounded-xl border bg-card", c.decision === "APROBADA" ? "border-emerald-500/60" : "border-border", c.decision === "DESCARTADA" && "opacity-55")}>
                    <a href={c.full} target="_blank" rel="noreferrer" className="relative block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.src} alt={c.name} loading="lazy" className="aspect-[9/16] w-full bg-black object-cover" />
                      {b ? <span className={cn("absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold", b.cls)}>{b.label}</span> : null}
                    </a>
                    <div className="space-y-1.5 p-2.5">
                      <p className="truncate text-xs font-semibold" title={c.name}>{c.name}</p>
                      {c.decision === "CAMBIOS" && c.decisionNote ? (
                        <p className="line-clamp-2 text-[11px] text-amber-300" title={c.decisionNote}>«{c.decisionNote}»</p>
                      ) : null}
                      {c.decisionBy && decided ? <p className="text-[10.5px] text-muted-foreground">{c.decision === "APROBADA" ? "Aprobó" : "Decidió"}: {c.decisionBy}</p> : null}
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {isAB ? (
                          c.decision !== "APROBADA" ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => winner(c)}
                              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                            >
                              {busy ? <Loader2 className="size-3 animate-spin" /> : <Crown className="size-3" />} Elegir esta
                            </button>
                          ) : null
                        ) : c.decision !== "APROBADA" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => approve(c)}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
                          >
                            {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Aprobar
                          </button>
                        ) : null}
                        {c.decision !== "APROBADA" && c.decision !== "DESCARTADA" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => { setChanges(c); setNote(""); }}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
                          >
                            <Pencil className="size-3" /> Cambios
                          </button>
                        ) : null}
                        {c.decision === "APROBADA" ? (
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

      {/* Modal «pedir cambios» */}
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
