"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, CheckCircle2, FolderOpen, Loader2, ReceiptText, Users, X } from "lucide-react";
import { archiveClient, getClientArchivePreflight, type ClientArchivePreflight } from "./actions";

// PRE-VUELO de archivar cliente (mismo patrón que archive-preflight de proyecto): antes de
// mandarlo a la papelera, dice CON NÚMEROS qué arrastra — sus proyectos se archivan también
// (mismo timestamp: restaurar el cliente los revive exactamente a ellos), las cotizaciones y
// facturas viajan intactas, y los usuarios del portal quedan sin acceso mientras duerma.
// Datos por server action al abrir (setState asíncrono en .then; nunca síncrono en el efecto).
export function ClientArchiveDialog({
  clientId,
  clientName,
  open,
  onClose,
}: {
  clientId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = React.useState<ClientArchivePreflight | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getClientArchivePreflight(clientId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [open, clientId]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const r = await archiveClient(clientId);
      if (r.ok) { onClose(); router.refresh(); }
      else setError(r.error ?? "No se pudo archivar el cliente.");
    });
  };

  const totalProjects = (data?.activeProjects ?? 0) + (data?.finishedProjects ?? 0);

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Archivar el cliente ${clientName}`}
        className="absolute left-1/2 top-1/2 w-[min(29rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl duration-200 animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10">
            <Archive className="size-4.5 text-destructive" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">Archivar «{clientName}»</h2>
            <p className="text-xs text-muted-foreground">Va a la papelera con todo lo suyo; nada se borra y se puede restaurar cuando quieras.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {data === null ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Revisando qué arrastra…</p>
        ) : (
          <div className="mt-4 space-y-1.5 rounded-xl border border-border bg-muted/30 p-3 text-[13px]">
            <p className="flex items-center gap-2">
              <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
              {totalProjects ? (
                <span>
                  <b>{totalProjects} proyecto{totalProjects === 1 ? "" : "s"} se archiva{totalProjects === 1 ? "" : "n"} con él</b>
                  {data.activeProjects && data.finishedProjects ? ` (${data.activeProjects} activo${data.activeProjects === 1 ? "" : "s"} + ${data.finishedProjects} terminado${data.finishedProjects === 1 ? "" : "s"})` : data.activeProjects ? " (activos: quedan en solo lectura)" : " (terminados: conservan su cierre)"}
                  . Restaurar el cliente los revive.
                </span>
              ) : (
                <span className="text-muted-foreground">Sin proyectos activos — cliente listo para archivar. ✓</span>
              )}
            </p>
            <p className="flex items-center gap-2"><ReceiptText className="size-4 shrink-0 text-muted-foreground" /> {data.quotes || data.invoices ? <span><b>{data.quotes} cotizaci{data.quotes === 1 ? "ón" : "ones"} y {data.invoices} factura{data.invoices === 1 ? "" : "s"}</b> se conservan intactas (solo se ocultan con él).</span> : <span className="text-muted-foreground">Sin cotizaciones ni facturas.</span>}</p>
            <p className="flex items-center gap-2"><Users className="size-4 shrink-0 text-muted-foreground" /> {data.portalMembers ? <span>{data.portalMembers} usuario{data.portalMembers === 1 ? "" : "s"} del portal queda{data.portalMembers === 1 ? "" : "n"} sin acceso mientras esté archivado.</span> : <span className="text-muted-foreground">Sin usuarios de portal.</span>}</p>
            <p className="flex items-center gap-2"><CheckCircle2 className="size-4 shrink-0 text-muted-foreground" /> Se queda en la papelera <b>hasta que tú decidas</b> borrarlo definitivamente.</p>
          </div>
        )}

        {error ? <p className="mt-3 text-xs font-medium text-destructive">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="rounded-lg border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60">
            Cancelar
          </button>
          <button onClick={confirm} disabled={pending || data === null} className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-1.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />} Archivar cliente
          </button>
        </div>
      </div>
    </div>
  );
}
