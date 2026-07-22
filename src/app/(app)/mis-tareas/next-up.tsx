"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { completeMyTask } from "./actions";
import { startTaskTimer, stopTaskTimer } from "./timer-actions";
import { postponeTask } from "@/app/(app)/proyectos/[id]/actions";

// «Ahora sigue» (Tareas 2.0, Fase 1): el héroe de Mis tareas — la tarea con mayor puntaje
// (vencimiento + prioridad + rodaje hoy + a cuántas desbloquea; calculado en el server) con
// las 3 acciones que importan: ▶ cronómetro, ✓ completar, 💤 posponer. Si hay un cronómetro
// CORRIENDO, el héroe lo muestra a él (aunque sea otra tarea) con el tiempo vivo.
//
// Reloj sin violar la pureza: useSyncExternalStore con un ticker de módulo (patrón de
// Recordatorios) — nada de Date.now() en el render ni setState síncrono en efectos.
const TICK = 1_000;
function subscribeTick(cb: () => void): () => void {
  const id = setInterval(cb, TICK);
  return () => clearInterval(id);
}
function readTick(): number {
  return Math.floor(Date.now() / TICK) * TICK;
}

export type HeroTask = {
  id: string;
  title: string;
  detail: string; // «vence hoy 5:00 pm · ⏱ 2h estimadas · desbloquea 1» — armado en el server
  projectName: string | null;
};
export type HeroTimer = { taskId: string; taskTitle: string; startedAtIso: string };

export function NextUpHero({ task, timer }: { task: HeroTask | null; timer: HeroTimer | null }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const now = React.useSyncExternalStore(subscribeTick, readTick, () => 0);

  if (!task && !timer) return null;

  const run = (fn: () => Promise<void>) => {
    setError(null);
    setNote(null);
    startTransition(async () => {
      try {
        await fn();
      } catch {
        setError("No se pudo completar la acción.");
      }
    });
  };

  const started = timer ? Date.parse(timer.startedAtIso) : 0;
  const elapsedSec = timer && now ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  const mm = Math.floor(elapsedSec / 60);
  const clock = `${Math.floor(mm / 60) ? `${Math.floor(mm / 60)}:` : ""}${String(mm % 60).padStart(Math.floor(mm / 60) ? 2 : 1, "0")}:${String(elapsedSec % 60).padStart(2, "0")}`;

  const focusId = timer?.taskId ?? task!.id;
  const title = timer?.taskTitle ?? task!.title;

  return (
    <div className="mt-4 max-w-2xl rounded-2xl bg-gradient-to-br from-primary to-indigo-900 p-4 text-white shadow-lg shadow-primary/20">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
        {timer ? "⏱ Cronómetro corriendo" : "▶ Ahora sigue"}
      </p>
      <p className="mt-0.5 truncate text-lg font-bold">{title}</p>
      <p className="truncate text-xs text-white/80">
        {timer ? `${clock} — al parar se anota solo en el parte de horas` : task!.detail}
        {!timer && task!.projectName ? ` · ${task!.projectName}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {timer ? (
          <button
            onClick={() => run(async () => {
              const r = await stopTaskTimer();
              if (r.ok) { setNote(`Anotados ${r.minutes} min en «${r.taskTitle}».`); router.refresh(); }
              else setError(r.error ?? "No se pudo parar.");
            })}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />} Parar y anotar
          </button>
        ) : (
          <button
            onClick={() => run(async () => {
              const r = await startTaskTimer(focusId);
              if (r.ok) { if (r.switchedFrom) setNote(`El reloj de «${r.switchedFrom}» quedó anotado.`); router.refresh(); }
              else setError(r.error ?? "No se pudo empezar.");
            })}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Empezar
          </button>
        )}
        <button
          onClick={() => run(async () => {
            const r = await completeMyTask(focusId);
            if (r.ok) router.refresh();
            else setError(r.error ?? "No se pudo completar.");
          })}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-60"
        >
          <Check className="size-3.5" /> Completar
        </button>
        <details data-autoclose className="relative">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25">
            💤 Posponer <ChevronDown className="size-3" />
          </summary>
          <div className="absolute left-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 text-foreground shadow-lg">
            {([["tarde", "Esta tarde"], ["manana", "Mañana"], ["lunes", "El lunes"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => run(async () => {
                  const r = await postponeTask(focusId, k);
                  if (r.ok) router.refresh();
                  else setError(r.error ?? "No se pudo posponer.");
                })}
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent"
              >
                {label}
              </button>
            ))}
          </div>
        </details>
      </div>
      {error ? <p className="mt-2 text-xs font-semibold text-rose-200">{error}</p> : null}
      {note ? <p className="mt-2 text-xs font-medium text-emerald-200">{note}</p> : null}
    </div>
  );
}

// Botoncito ▶ por fila: arranca el cronómetro sobre ESA tarea (y para el anterior, si había).
export function TimerRowButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [err, setErr] = React.useState(false);
  return (
    <button
      onClick={() => {
        setErr(false);
        startTransition(async () => {
          const r = await startTaskTimer(taskId);
          if (r.ok) router.refresh();
          else setErr(true);
        });
      }}
      disabled={pending}
      title={err ? "Solo el responsable o el dueño pueden cronometrarla" : "Empezar cronómetro"}
      aria-label="Empezar cronómetro"
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-emerald-500/15 hover:text-emerald-600 disabled:opacity-50",
        err && "text-destructive",
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
    </button>
  );
}
