"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { addTaskDependency, removeTaskDependency, getTaskDependencies, getDependencyOptions } from "./actions";

// Editor de DEPENDENCIAS del panel de tarea (Tareas 2.0, Fase 1): «bloqueada por …».
// Autónomo: carga bloqueadoras y candidatas al montar por server actions (setState asíncrono
// en .then — la regla set-state-in-effect solo prohíbe el síncrono), así el panel no necesita
// que la página del proyecto cargue nada nuevo. El server valida acceso, mismo-proyecto y
// ciclos; completar la bloqueadora desbloquea y avisa «te toca».
type Dep = { id: string; title: string; done: boolean };

export function DependenciesEditor({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [deps, setDeps] = React.useState<Dep[] | null>(null);
  const [options, setOptions] = React.useState<{ id: string; title: string }[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const reload = React.useCallback(() => {
    getTaskDependencies(taskId).then(setDeps).catch(() => setDeps([]));
    getDependencyOptions(taskId).then(setOptions).catch(() => setOptions([]));
  }, [taskId]);

  React.useEffect(() => {
    let cancelled = false;
    getTaskDependencies(taskId).then((d) => { if (!cancelled) setDeps(d); }).catch(() => { if (!cancelled) setDeps([]); });
    getDependencyOptions(taskId).then((o) => { if (!cancelled) setOptions(o); }).catch(() => { if (!cancelled) setOptions([]); });
    return () => { cancelled = true; };
  }, [taskId]);

  const add = (blockerId: string) => {
    if (!blockerId) return;
    setError(null);
    startTransition(async () => {
      const r = await addTaskDependency(taskId, blockerId);
      if (r.ok) { reload(); router.refresh(); }
      else setError(r.error ?? "No se pudo añadir.");
    });
  };
  const remove = (blockerId: string) => {
    setError(null);
    startTransition(async () => {
      const r = await removeTaskDependency(taskId, blockerId);
      if (r.ok) { reload(); router.refresh(); }
      else setError(r.error ?? "No se pudo quitar.");
    });
  };

  const open = (deps ?? []).filter((d) => !d.done);

  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link2 className="size-3.5" /> Bloqueada por
        {open.length ? <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold"><Lock className="size-2.5" /> {open.length}</span> : null}
      </p>
      {deps === null ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Cargando…</p>
      ) : (
        <>
          {deps.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {deps.map((d) => (
                <span key={d.id} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", d.done ? "border-emerald-500/40 text-emerald-600 line-through opacity-70 dark:text-emerald-400" : "border-border bg-card")}>
                  {d.title}
                  <button onClick={() => remove(d.id)} disabled={pending} aria-label={`Quitar dependencia de ${d.title}`} className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="mb-2 text-[11px] text-muted-foreground">Sin dependencias: esta tarea no espera a ninguna otra.</p>
          )}
          {options.length ? (
            <select
              value=""
              onChange={(e) => add(e.target.value)}
              disabled={pending}
              className="w-full cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <option value="">+ Añadir bloqueadora (del mismo proyecto)…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.title}</option>
              ))}
            </select>
          ) : null}
        </>
      )}
      {error ? <p className="mt-1.5 text-[11px] font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
