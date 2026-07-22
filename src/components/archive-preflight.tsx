"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CalendarOff, Link2Off, Loader2, Repeat, Snowflake, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { archiveProject, getArchivePreflight, type ArchivePreflight } from "@/app/(app)/proyectos/[id]/actions";

// Modal PRE-VUELO de archivar (Fase 2 del ciclo de vida): antes de mandar el proyecto a la
// papelera, muestra lo que sigue "vivo" y qué pasará con ello. Dos tipos de línea:
// - INFORMATIVAS (automáticas, reversibles): tareas/recurrentes/avisos se silencian solos
//   mientras el proyecto duerma (filtros de Fase 1) y despiertan al restaurar.
// - OPCIONALES (checkbox, quedan hechas): revocar enlaces públicos (rota el nonce → URLs
//   filtradas mueren para siempre) y avisar al equipo por la campana.
// Los contadores llegan de getArchivePreflight al abrir (setState asíncrono en .then: la regla
// set-state-in-effect solo prohíbe el setState SÍNCRONO en el cuerpo del efecto).
export function ArchivePreflightDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = React.useState<ArchivePreflight | null>(null);
  const [revoke, setRevoke] = React.useState(true);
  const [notifyTeam, setNotifyTeam] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getArchivePreflight(projectId)
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

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const r = await archiveProject(projectId, { revokeLinks: revoke, notifyTeam });
      if (r.ok) router.push("/proyectos");
      else setError(r.error ?? "No se pudo archivar el proyecto.");
    });
  };

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Enviar el proyecto a la papelera"
        className="absolute left-1/2 top-1/2 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-2xl duration-200 animate-in fade-in zoom-in-95"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10">
            <Trash2 className="size-4.5 text-destructive" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">Enviar el proyecto a la papelera</h2>
            <p className="text-xs text-muted-foreground">No se borra nada: queda en solo lectura y se puede restaurar cuando quieras.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Lo que se silencia SOLO (reversible al restaurar) */}
        {data === null ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Revisando qué queda vivo…</p>
        ) : (
          <div className="mt-4 space-y-1.5 rounded-xl border border-border bg-muted/30 p-3 text-[13px]">
            <p className="flex items-center gap-2"><BellOff className="size-4 shrink-0 text-muted-foreground" /> {data.openTasks ? <span><b>{data.openTasks} tarea{data.openTasks === 1 ? "" : "s"} abierta{data.openTasks === 1 ? "" : "s"}</b> salen de Mis tareas y calendarios.</span> : <span className="text-muted-foreground">Sin tareas abiertas.</span>}</p>
            <p className="flex items-center gap-2"><Repeat className="size-4 shrink-0 text-muted-foreground" /> {data.recurring || data.reminders ? <span><b>{data.recurring} recurrente{data.recurring === 1 ? "" : "s"} y {data.reminders} aviso{data.reminders === 1 ? "" : "s"}</b> quedan en pausa mientras duerma.</span> : <span className="text-muted-foreground">Sin recurrentes ni avisos pendientes.</span>}</p>
            <p className="flex items-center gap-2"><Snowflake className="size-4 shrink-0 text-muted-foreground" /> El chat del proyecto queda congelado (solo lectura).</p>
            <p className="flex items-center gap-2"><CalendarOff className="size-4 shrink-0 text-muted-foreground" /> Sus fechas dejan de sincronizar con Google/Apple Calendar.</p>
          </div>
        )}

        {/* Acciones opcionales (estas sí quedan hechas) */}
        {data ? (
          <div className="mt-3 space-y-2">
            <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3 text-[13px]", !data.publicLinks && "cursor-default opacity-55")}>
              <input type="checkbox" checked={revoke && data.publicLinks > 0} disabled={!data.publicLinks || pending} onChange={(e) => setRevoke(e.target.checked)} className="mt-0.5 accent-primary" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium"><Link2Off className="size-3.5" /> Revocar {data.publicLinks || "los"} enlace{data.publicLinks === 1 ? "" : "s"} público{data.publicLinks === 1 ? "" : "s"}</span>
                <span className="block text-xs text-muted-foreground">La revisión del cliente y el portal de subida dejan de funcionar, incluso si luego restauras el proyecto.</span>
              </span>
            </label>
            <label className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border border-border p-3 text-[13px]", !data.team && "cursor-default opacity-55")}>
              <input type="checkbox" checked={notifyTeam && data.team > 0} disabled={!data.team || pending} onChange={(e) => setNotifyTeam(e.target.checked)} className="mt-0.5 accent-primary" />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-medium"><Bell className="size-3.5" /> Avisar al equipo ({data.team} persona{data.team === 1 ? "" : "s"})</span>
                <span className="block text-xs text-muted-foreground">«El proyecto pasó a la papelera» en la campana de cada uno.</span>
              </span>
            </label>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-xs font-medium text-destructive">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={pending} className="rounded-lg border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60">
            Cancelar
          </button>
          <button onClick={confirm} disabled={pending || data === null} className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-1.5 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Mover a la papelera
          </button>
        </div>
      </div>
    </div>
  );
}
