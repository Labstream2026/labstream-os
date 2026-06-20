"use client";

import * as React from "react";
import { Check, X, Eye, Link2Off, Link2, Loader2, CheckCircle2, Circle, Send, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/copy-link";
import { internalDecision, setReviewRevoked, resolveReviewComment, replyToReview } from "./actions";
import { usePromptDialog } from "@/components/ui/prompt-dialog";

// Controles de pre-aprobación interna de una versión (solo equipo gestor).
export function PreApproval({ deliverableId, projectId, versionNumber }: { deliverableId: string; projectId: string; versionNumber: number }) {
  const [pending, start] = React.useTransition();
  const { prompt, dialog } = usePromptDialog();
  async function decide(result: "APROBADO" | "CAMBIOS") {
    let note: string | undefined = undefined;
    if (result === "CAMBIOS") {
      const r = await prompt({ title: "Pedir cambios", message: "¿Qué cambios pides al equipo? (opcional)" });
      if (r === null) return; // canceló el diálogo
      note = r;
    }
    start(() => internalDecision(deliverableId, projectId, versionNumber, result, note));
  }
  return (
    <div className="flex items-center gap-1.5">
      {dialog}
      <button onClick={() => decide("APROBADO")} disabled={pending} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Aprobar interna
      </button>
      <button onClick={() => decide("CAMBIOS")} disabled={pending} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-500/10 dark:text-amber-300">
        <X className="size-3.5" /> Pedir cambios
      </button>
    </div>
  );
}

// Barra del enlace de revisión del cliente: copiar/abrir, visitas, revocar, modo dibujos.
export function ReviewLinkBar({
  deliverableId,
  projectId,
  url,
  visits,
  revoked,
  hasApproved,
  children,
}: {
  deliverableId: string;
  projectId: string;
  url: string;
  visits: number;
  revoked: boolean;
  allowDrawings?: boolean; // (obsoleto) el "modo dibujos" se quitó del enlace; el prop se acepta sin usar
  hasApproved: boolean;
  children?: React.ReactNode;
}) {
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Revisión del cliente:</span>
        {!revoked ? (
          <>
            <CopyLink url={url} />
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Abrir portal</a>
          </>
        ) : (
          <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">Enlace revocado</span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Eye className="size-3.5" /> {visits} visita{visits === 1 ? "" : "s"}</span>
        {/* Enviar al cliente (por correo) */}
        {children}
        {/* Revocar / reactivar — junto a "Enviar al cliente". Revocar va en ROJO porque es
            destructivo (inutiliza el enlace); reactivar, en neutro. */}
        <button
          onClick={() => start(() => setReviewRevoked(deliverableId, projectId, !revoked))}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50",
            revoked
              ? "border-border hover:bg-accent"
              : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20",
          )}
        >
          {revoked ? <><Link2 className="size-3.5" /> Reactivar enlace</> : <><Link2Off className="size-3.5" /> Revocar enlace</>}
        </button>
      </div>
      {!hasApproved ? (
        <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          ⚠ Ninguna versión está aprobada internamente: el cliente verá «en revisión interna» hasta que el equipo apruebe una versión.
        </p>
      ) : null}
    </div>
  );
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export type ReviewThreadComment = {
  id: string;
  authorName: string;
  body: string;
  timecode: number | null;
  versionNumber: number | null;
  image: string | null; // captura del fotograma con la anotación (si la hay)
  isNote: boolean;
  resolved: boolean;
  fromClient: boolean;
  createdAt: Date | string;
};

// Checklist de correcciones del entregable, en la VISTA DEL ENTREGABLE (lo trabaja el
// editor): cada cambio pedido (interno o del cliente) muestra su CAPTURA del fotograma y
// el comentario, con una casilla para marcarlo como realizado (avisa al equipo). Las
// notas generales (sin captura) se listan aparte. El checklist vive aquí, no en el
// workspace de pre-aprobación ni en el portal del cliente.
export function ReviewThread({ deliverableId, projectId, comments }: { deliverableId: string; projectId: string; comments: ReviewThreadComment[] }) {
  const [pending, start] = React.useTransition();
  const [body, setBody] = React.useState("");
  // Estado «realizado» optimista (resolveReviewComment no revalida la página).
  const [override, setOverride] = React.useState<Record<string, boolean>>({});
  // Acordeón por versión: null = aún sin tocar (abre solo la última); luego, conjunto explícito.
  const [openVersions, setOpenVersions] = React.useState<Set<number | "none"> | null>(null);
  if (comments.length === 0) return null;
  const withRes = comments.map((c) => (c.id in override ? { ...c, resolved: override[c.id] } : c));
  const changes = withRes.filter((c) => !c.isNote);
  const notes = withRes.filter((c) => c.isNote);
  const done = changes.filter((c) => c.resolved).length;
  const toggle = (c: ReviewThreadComment) => {
    const next = !c.resolved;
    setOverride((p) => ({ ...p, [c.id]: next }));
    start(() => resolveReviewComment(c.id, projectId, next));
  };

  // Agrupa las correcciones por versión (más nueva arriba; las sin versión, al final) para
  // que cada bloque sea un acordeón: con muchas versiones ocupa poco y NO se pierden las
  // capturas de las versiones ya enviadas — solo quedan plegadas.
  const groups = (() => {
    const map = new Map<number | "none", ReviewThreadComment[]>();
    for (const c of changes) {
      const k = c.versionNumber ?? "none";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return [...map.keys()]
      .sort((a, b) => (a === "none" ? 1 : b === "none" ? -1 : (b as number) - (a as number)))
      .map((k) => ({ key: k, items: map.get(k)! }));
  })();
  const latestKey = groups[0]?.key;
  // Por defecto, solo la versión más nueva queda abierta; el resto, plegado.
  const openSet = openVersions ?? new Set(latestKey != null ? [latestKey] : []);
  const toggleVersion = (k: number | "none") => {
    const base = openVersions ?? new Set(latestKey != null ? [latestKey] : []);
    const next = new Set(base);
    if (next.has(k)) next.delete(k); else next.add(k);
    setOpenVersions(next);
  };

  return (
    <div className="mt-3 border-t border-border pt-3">
      {changes.length > 0 ? (
        <>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
            Checklist de correcciones · {done}/{changes.length} hechos
          </p>
          <div className="space-y-2">
            {groups.map(({ key, items }) => {
              const gDone = items.filter((c) => c.resolved).length;
              const open = openSet.has(key);
              return (
                <div key={String(key)} className="overflow-hidden rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => toggleVersion(key)}
                    className="flex w-full items-center gap-2 bg-muted/40 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-muted/70"
                  >
                    {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                    <span>{key === "none" ? "Sin versión" : `Versión ${key}`}</span>
                    <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium", gDone === items.length ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-background text-muted-foreground")}>
                      {gDone}/{items.length} hechos
                    </span>
                  </button>
                  {open ? (
                    <div className="space-y-2 p-2">
                      {items.map((c) => (
                        <div key={c.id} className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm", c.resolved ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5" : "border-border")}>
                          <button
                            onClick={() => toggle(c)}
                            disabled={pending}
                            title={c.resolved ? "Marcar como pendiente" : "Marcar como realizado"}
                            className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-600 disabled:opacity-50"
                          >
                            {c.resolved ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Circle className="size-5" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-medium">{c.authorName}</span>
                              {!c.fromClient ? <span className="rounded bg-secondary px-1.5 text-[10px] text-secondary-foreground">equipo</span> : <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">cliente</span>}
                              {c.timecode != null ? <span className="rounded bg-primary/10 px-1.5 font-mono text-[10px] text-primary">{fmtTime(c.timecode)}</span> : null}
                              {c.resolved ? <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">✓ hecho</span> : null}
                            </div>
                            <p className={cn("whitespace-pre-wrap text-[13px]", c.resolved ? "text-muted-foreground line-through" : "text-foreground/90")}>{c.body}</p>
                            {c.image ? (
                              // Captura del fotograma: el editor ve exactamente dónde es la corrección.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.image} alt="Captura de la corrección" className="mt-1.5 w-full max-w-sm rounded-md border border-border" />
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {notes.length > 0 ? (
        <div className={cn(changes.length > 0 && "mt-3")}>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Notas generales</p>
          <div className="space-y-1.5">
            {notes.map((c) => (
              <div key={c.id} className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{c.authorName}</span>
                  {!c.fromClient ? <span className="rounded bg-secondary px-1.5 text-[10px] text-secondary-foreground">equipo</span> : <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">cliente</span>}
                </div>
                <p className="whitespace-pre-wrap text-[13px] text-foreground/90">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form
        onSubmit={(e) => { e.preventDefault(); if (!body.trim()) return; const fd = new FormData(); fd.set("body", body); start(async () => { await replyToReview(deliverableId, projectId, fd); setBody(""); }); }}
        className="mt-2 flex items-center gap-2"
      >
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Responder al cliente…" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <button disabled={pending || !body.trim()} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Send className="size-3.5" /> Responder
        </button>
      </form>
    </div>
  );
}
