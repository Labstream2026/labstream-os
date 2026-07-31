"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/ui";
import { guardarMetaFacturacion } from "./finanzas-actions";

// ── Meta mensual de facturación ───────────────────────────────────────────────
// Una sola cifra compartida por el equipo (OrgSettings): tú fijas la meta y el Resumen
// pinta el avance del mes contra ella. Sin meta, el control es una invitación discreta.

export function MetaEditor({ meta, facturadoMes }: { meta: number | null; facturadoMes: number }) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const [valor, setValor] = React.useState(meta != null ? String(meta) : "");
  const [pendiente, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const guardar = (monto: number | null) => {
    setError(null);
    start(async () => {
      const r = await guardarMetaFacturacion(monto);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setEditando(false);
      router.refresh();
    });
  };

  if (editando) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
        <Target className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">Meta del mes</span>
        <input
          autoFocus
          inputMode="numeric"
          value={valor}
          onChange={(e) => setValor(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="30000000"
          className="w-36 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => guardar(valor ? Number(valor) : null)}
          disabled={pendiente || !valor}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null} Guardar
        </button>
        {meta != null ? (
          <button onClick={() => guardar(null)} disabled={pendiente} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
            Quitar meta
          </button>
        ) : null}
        <button onClick={() => setEditando(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Cancelar">
          <X className="size-3.5" />
        </button>
        {error ? <p className="w-full text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  if (meta == null) {
    return (
      <button
        onClick={() => {
          setValor("");
          setEditando(true);
        }}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <Target className="size-4" /> Fijar la meta de facturación del mes — el resumen te dirá cómo vas.
      </button>
    );
  }

  const pct = Math.min(100, Math.round((facturadoMes / meta) * 100));
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
        <Target className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">Meta del mes</span>
        <span className="text-muted-foreground">
          {formatMoney(facturadoMes, "COP")} de {formatMoney(meta, "COP")}
        </span>
        <span className={cn("ml-auto font-semibold tabular-nums", pct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>{pct} %</span>
        <button onClick={() => { setValor(String(meta)); setEditando(true); }} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Editar la meta" title="Editar la meta">
          <Pencil className="size-3.5" />
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-accent">
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
