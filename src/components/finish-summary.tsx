"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, Clock3, Loader2, Package, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { finishProject, getFinishSummary, type FinishSummary } from "@/app/(app)/proyectos/[id]/actions";

// Modal RESUMEN DE CIERRE (Fase 3 del ciclo de vida): al «Terminar», en vez de un confirm seco,
// el broche del proyecto en números — tareas, entregables aprobados, horas registradas — y el
// único aviso que puede frenar el cierre: facturas sin cobrar (terminar no las toca). Espejo
// celebratorio del pre-vuelo de archivar (archive-preflight.tsx); mismos patrones: datos por
// server action al abrir (setState en .then, nunca síncrono en el efecto) y ESC para cerrar.
export function FinishSummaryDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = React.useState<FinishSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getFinishSummary(projectId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [open, projectId]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hours = data ? Math.round(data.minutes / 6) / 10 : 0; // 1 decimal (p. ej. 128.5 h)

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const r = await finishProject(projectId);
      if (r.ok) router.push("/proyectos?vista=terminados");
      else setError(r.error ?? "No se pudo terminar el proyecto.");
    });
  };

  const stat = (icon: React.ReactNode, value: string, label: string) => (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-center">
      <div className="mx-auto mb-1 grid size-7 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">{icon}</div>
      <p className="text-base font-bold leading-tight tabular-nums">{value}</p>
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Marcar el proyecto como terminado"
        className="absolute left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl duration-200 animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="size-4.5 text-emerald-500" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Marcar como terminado</h2>
            <p className="text-xs text-muted-foreground">Pasa al archivo de «Terminados» (consultable, reversible) y el estado queda en Entregado.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {data === null ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Sumando el proyecto…</p>
        ) : (
          <>
            {/* El broche en números */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {stat(<ClipboardList className="size-3.5" />, String(data.tasksTotal), data.tasksOpen ? `tareas (${data.tasksOpen} abiertas)` : "tareas")}
              {stat(<Package className="size-3.5" />, `${data.deliverablesApproved}/${data.deliverablesTotal}`, "entregables aprobados")}
              {stat(<Clock3 className="size-3.5" />, `${hours} h`, "horas registradas")}
            </div>
            {data.tasksOpen > 0 ? (
              <p className="mt-2 text-[11.5px] text-muted-foreground">Las {data.tasksOpen === 1 ? "tarea abierta se silencia" : `${data.tasksOpen} tareas abiertas se silencian`} (dejan de contar como pendientes); si reabres, vuelven.</p>
            ) : null}
            {/* Lo único que puede frenar el cierre: plata pendiente */}
            {data.invoicesPending > 0 ? (
              <div className={cn("mt-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[13px]", "border-amber-500/40 bg-amber-500/10")}>
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span><b>{data.invoicesPending} factura{data.invoicesPending === 1 ? "" : "s"} sin cobrar</b> (enviada{data.invoicesPending === 1 ? "" : "s"} o vencida{data.invoicesPending === 1 ? "" : "s"}). Terminar no las toca — síguelas en Facturación.</span>
              </div>
            ) : null}
          </>
        )}

        {error ? <p className="mt-3 text-xs font-medium text-destructive">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="rounded-lg border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60">
            Cancelar
          </button>
          <button onClick={confirm} disabled={pending || data === null} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Marcar como terminado
          </button>
        </div>
      </div>
    </div>
  );
}
