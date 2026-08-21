"use client";

import { quickAddTask } from "@/app/(app)/proyectos/[id]/actions";
import { encolar } from "./cola";

// ── Crear tarea rápida RESILIENTE (Fase 2 offline) ──
// Online: usa el server action de siempre. El `id` lo genera el cliente y viaja también online,
// así que si el servidor lo recibió pero la respuesta se perdió (caída a mitad), reenviar por la
// cola con el MISMO id no duplica (quickCreateFromText hace create-si-no-existe por ese id).
// Un {ok:false} DEVUELTO (sin permiso, texto vacío) NO se encola: es respuesta del servidor, no
// una caída de red, y se propaga tal cual.

export type ResultadoTarea = { ok: boolean; error?: string; taskId?: string; pendiente?: boolean };

export async function crearTareaRapidaResiliente(text: string, projectId: string | null): Promise<ResultadoTarea> {
  const id = crypto.randomUUID();
  try {
    return await quickAddTask(text, projectId, id);
  } catch {
    const titulo = text.trim().replace(/\s+/g, " ").slice(0, 40) || "Tarea";
    await encolar({
      opId: `task-quick:${id}`,
      kind: "task-quick",
      endpoint: "/api/tareas/quick",
      body: { id, text, projectId },
      createdAt: Date.now(),
      etiqueta: `Tarea: ${titulo}`,
    });
    return { ok: true, taskId: id, pendiente: true };
  }
}
