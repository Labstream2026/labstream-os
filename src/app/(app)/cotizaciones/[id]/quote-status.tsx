"use client";

import { useTransition } from "react";
import { setQuoteStatus } from "../actions";

export function QuoteStatusActions({
  quoteId,
  status,
  canEdit,
  canApprove,
}: {
  quoteId: string;
  status: string;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const [pending, start] = useTransition();
  const set = (s: string) => start(() => setQuoteStatus(quoteId, s));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEdit && status !== "ENVIADA" && status !== "APROBADA" ? (
        <button
          onClick={() => set("ENVIADA")}
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Marcar como enviada
        </button>
      ) : null}

      {canEdit && status !== "BORRADOR" ? (
        <button
          onClick={() => set("BORRADOR")}
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          Volver a borrador
        </button>
      ) : null}

      {canApprove && status !== "APROBADA" ? (
        <button
          onClick={() => set("APROBADA")}
          disabled={pending}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Aprobar
        </button>
      ) : null}

      {canApprove && status !== "RECHAZADA" ? (
        <button
          onClick={() => set("RECHAZADA")}
          disabled={pending}
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20 disabled:opacity-50"
        >
          Rechazar
        </button>
      ) : null}
    </div>
  );
}
