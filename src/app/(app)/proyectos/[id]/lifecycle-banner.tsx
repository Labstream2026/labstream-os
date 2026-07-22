"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, CheckCircle2, Loader2, RotateCcw, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { restoreProject, reopenProject, requestReopenProject } from "./actions";

// Banner-LÁPIDA del proyecto DORMIDO (papelera o terminado). Fase 1 del ciclo de vida: el
// candado real es server-side (canWriteProject bloquea proyectos dormidos), este banner lo dice
// de frente y da la salida a un clic:
// - Papelera → «Restaurar» (ver_papelera + gestionar el proyecto).
// - Terminado → «Reabrir para editar» (quien lo gestiona) o «Pedir retomar» (cualquier miembro,
//   incluido el portal del cliente: avisa al equipo, no reabre nada — la acción ya es anti-spam).
// Sin fechas relativas ni relojes: el `detail` llega formateado del servidor (hora Bogotá).
export function ProjectLifecycleBanner({
  projectId,
  mode,
  detail,
  canRestore,
  canReopen,
}: {
  projectId: string;
  mode: "papelera" | "terminado";
  detail: string;
  canRestore: boolean;
  canReopen: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [requested, setRequested] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch {
        setError("No se pudo completar. Intenta de nuevo.");
      }
    });
  };

  const trash = mode === "papelera";
  return (
    <div
      role="status"
      className={cn(
        "mx-auto mb-4 flex max-w-7xl flex-wrap items-center gap-3 rounded-xl border px-4 py-3",
        trash ? "border-destructive/40 bg-destructive/10" : "border-emerald-500/40 bg-emerald-500/10",
      )}
    >
      {trash ? (
        <Trash2 className="size-5 shrink-0 text-destructive" />
      ) : (
        <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {trash ? "Este proyecto está en la papelera" : "Proyecto terminado"}
        </p>
        <p className="text-xs text-muted-foreground">{detail}</p>
        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      </div>
      {trash && canRestore ? (
        <button
          onClick={() => run(async () => { const r = await restoreProject(projectId); if (r.ok) router.refresh(); else setError(r.error ?? "No se pudo restaurar."); })}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ArchiveRestore className="size-3.5" />} Restaurar proyecto
        </button>
      ) : null}
      {!trash && canReopen ? (
        <button
          onClick={() =>
            run(async () => {
              const r = await reopenProject(projectId);
              if (!r.ok) throw new Error(r.error);
              router.refresh();
            })
          }
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Reabrir para editar
        </button>
      ) : null}
      {!trash && !canReopen ? (
        requested ? (
          <span className="text-xs font-medium text-emerald-600">Listo — el equipo ya recibió tu solicitud.</span>
        ) : (
          <button
            onClick={() =>
              run(async () => {
                const r = await requestReopenProject(projectId);
                if (!r.ok) throw new Error(r.error);
                setRequested(true);
              })
            }
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/50 px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Pedir retomar
          </button>
        )
      ) : null}
    </div>
  );
}
