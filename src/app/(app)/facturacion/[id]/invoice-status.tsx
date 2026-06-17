"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { setInvoiceStatus } from "../actions";

const STEPS: { key: string; label: string }[] = [
  { key: "BORRADOR", label: "Borrador" },
  { key: "ENVIADA", label: "Enviada" },
  { key: "PAGADA", label: "Pagada" },
];

export function InvoiceStatusActions({
  invoiceId,
  status,
  canApprove,
}: {
  invoiceId: string;
  status: string;
  canApprove: boolean;
}) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function set(next: string) {
    if (!canApprove || pending) return;
    setError(null);
    start(async () => {
      const r = await setInvoiceStatus(invoiceId, next);
      if (!r.ok) setError(r.error ?? "No se pudo aplicar");
    });
  }

  if (!canApprove) return null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
        {STEPS.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={pending}
            onClick={() => set(s.key)}
            className={cn(
              "px-3 py-1.5 font-medium transition-colors disabled:opacity-50",
              status === s.key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {status !== "ANULADA" ? (
          <button type="button" disabled={pending} onClick={() => set("ANULADA")} className="text-[11px] text-muted-foreground hover:text-destructive">
            Anular factura
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => set("BORRADOR")} className="text-[11px] text-muted-foreground hover:text-foreground">
            Reactivar
          </button>
        )}
        {error ? <span className="text-[11px] text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
