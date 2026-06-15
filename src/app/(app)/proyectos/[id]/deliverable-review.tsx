"use client";

import * as React from "react";
import { Check, X, Eye, Link2Off, Link2, Pencil, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/copy-link";
import { internalDecision, setReviewRevoked, setReviewDrawings } from "./actions";

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
