"use client";

import { completeMyTask } from "@/app/(app)/mis-tareas/actions";
import { esNoAutorizado } from "@/lib/authz-error";
import { encolar } from "./cola";

// ── Marcar tarea HECHA, resiliente (Fase 2 offline) ──
// Online: usa el server action completeMyTask, que YA es idempotente (el guardián `completedAt`
// hace que completar dos veces sea un no-op). Solo el sentido → HECHA se sincroniza offline
// (reabrir/degradar sobrescribe estado y podría pisar a otro → se queda online).
// El opId es `task-complete:<taskId>` (no un uuid): colapsa toques repetidos de la MISMA tarea en
// una sola op. Un {ok:false} DEVUELTO (no existe, bloqueada por dependencias) se propaga, no se
// encola. Solo una caída de red encola; un noAutorizado se propaga.

export type ResultadoCompletar = { ok: boolean; error?: string; pendiente?: boolean };

export async function completarTareaResiliente(taskId: string, titulo?: string): Promise<ResultadoCompletar> {
  try {
    return await completeMyTask(taskId);
  } catch (e) {
    if (esNoAutorizado(e as Error & { digest?: string })) return { ok: false, error: "No autorizado" };
    await encolar({
      opId: `task-complete:${taskId}`,
      kind: "task-complete",
      endpoint: `/api/tareas/${taskId}/completar`,
      body: {},
      createdAt: Date.now(),
      etiqueta: `Completar: ${titulo ?? "tarea"}`,
    });
    return { ok: true, pendiente: true };
  }
}
