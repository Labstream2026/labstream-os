"use client";

import * as React from "react";
import { Check, X, Eye, Link2Off, Link2, Pencil, Loader2, CheckCircle2, Circle, ImageIcon, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/copy-link";
import { internalDecision, setReviewRevoked, setReviewDrawings, resolveReviewComment, replyToReview } from "./actions";

// Controles de pre-aprobación interna de una versión (solo equipo gestor).
export function PreApproval({ deliverableId, projectId, versionNumber }: { deliverableId: string; projectId: string; versionNumber: number }) {
  const [pending, start] = React.useTransition();
  function decide(result: "APROBADO" | "CAMBIOS") {
    const note = result === "CAMBIOS" ? window.prompt("¿Qué cambios pides al equipo? (opcional)") ?? undefined : undefined;
    if (result === "CAMBIOS" && note === undefined) return; // canceló el prompt
    start(() => internalDecision(deliverableId, projectId, versionNumber, result, note));
  }
  return (
    <div className="flex items-center gap-1.5">
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
  allowDrawings,
  hasApproved,
  children,
}: {
  deliverableId: string;
  projectId: string;
  url: string;
  visits: number;
  revoked: boolean;
  allowDrawings: boolean;
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
        {children}
      </div>
      {!hasApproved ? (
        <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          ⚠ Ninguna versión está aprobada internamente: el cliente verá «en revisión interna» hasta que el equipo apruebe una versión.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => start(() => setReviewRevoked(deliverableId, projectId, !revoked))}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {revoked ? <><Link2 className="size-3.5" /> Reactivar enlace</> : <><Link2Off className="size-3.5" /> Revocar enlace</>}
        </button>
        <label className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium", allowDrawings && "border-primary bg-primary/10 text-primary")}>
          <input type="checkbox" checked={allowDrawings} onChange={(e) => start(() => setReviewDrawings(deliverableId, projectId, e.target.checked))} className="size-3.5" />
          <Pencil className="size-3.5" /> Modo dibujos
        </label>
      </div>
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
  hasDrawing: boolean;
  resolved: boolean;
  fromClient: boolean;
  createdAt: Date | string;
};

// Hilo de comentarios de la revisión del cliente, visto por el equipo: resolver
// los comentarios del cliente y responder (la respuesta se ve en el portal).
export function ReviewThread({ deliverableId, projectId, comments }: { deliverableId: string; projectId: string; comments: ReviewThreadComment[] }) {
  const [pending, start] = React.useTransition();
  const [body, setBody] = React.useState("");
  if (comments.length === 0) return null;
  const pendingCount = comments.filter((c) => c.fromClient && !c.resolved).length;
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
        Comentarios del cliente{pendingCount > 0 ? ` · ${pendingCount} sin resolver` : ""}
      </p>
      <div className="space-y-1.5">
        {comments.map((c) => (
          <div key={c.id} className={cn("flex items-start gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm", c.resolved && "opacity-60", !c.fromClient && "bg-secondary/40")}>
            {c.fromClient ? (
              <button
                onClick={() => start(() => resolveReviewComment(c.id, projectId, !c.resolved))}
                disabled={pending}
                title={c.resolved ? "Marcar como pendiente" : "Marcar como resuelto"}
                className="mt-0.5 text-muted-foreground hover:text-emerald-600 disabled:opacity-50"
              >
                {c.resolved ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4" />}
              </button>
            ) : <span className="mt-0.5 w-4 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium">{c.authorName}</span>
                {!c.fromClient ? <span className="rounded bg-secondary px-1.5 text-[10px] text-secondary-foreground">equipo</span> : null}
                {c.versionNumber ? <span className="text-[10px] text-muted-foreground">v{c.versionNumber}</span> : null}
                {c.timecode != null ? <span className="rounded bg-primary/10 px-1.5 font-mono text-[10px] text-primary">{fmtTime(c.timecode)}</span> : null}
                {c.hasDrawing ? <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><ImageIcon className="size-3" /> dibujo</span> : null}
              </div>
              <p className="whitespace-pre-wrap text-[13px] text-foreground/90">{c.body}</p>
            </div>
          </div>
        ))}
      </div>
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
