"use client";

import { logTime } from "@/app/(app)/proyectos/[id]/actions";
import { esNoAutorizado } from "@/lib/authz-error";
import { encolar } from "./cola";

// ── Registrar horas RESILIENTE (Fase 2 offline) ──
// Online: usa el server action logTime. El `clientId` viaja también online, así que un reenvío por
// la cola con el mismo id no duplica las horas (logTime hace create-si-no-existe por ese id).
// logTime LANZA tanto por rechazo (permiso / horas inválidas) como por caída de red; solo la
// caída se encola. El rechazo se propaga (el panel ya valida las horas en el cliente antes de
// llamar, así que en la práctica lo que llega aquí es permiso o red).

export type ResultadoHoras = { ok: boolean; error?: string; pendiente?: boolean };

export async function registrarHorasResiliente(
  taskId: string,
  projectId: string,
  campos: { hours: string; note?: string; spentOn?: string; tituloTarea?: string },
): Promise<ResultadoHoras> {
  const id = crypto.randomUUID();
  const fd = new FormData();
  fd.set("clientId", id);
  fd.set("hours", campos.hours);
  if (campos.note) fd.set("note", campos.note);
  if (campos.spentOn) fd.set("spentOn", campos.spentOn);
  try {
    await logTime(taskId, projectId, fd);
    return { ok: true };
  } catch (e) {
    const err = e as Error & { digest?: string };
    if (esNoAutorizado(err) || /horas inválidas/i.test(err.message ?? "")) {
      return { ok: false, error: err.message || "No se pudo registrar" };
    }
    await encolar({
      opId: `time-log:${id}`,
      kind: "time-log",
      endpoint: `/api/tareas/${taskId}/horas`,
      body: { clientId: id, hours: campos.hours, note: campos.note, spentOn: campos.spentOn },
      createdAt: Date.now(),
      etiqueta: `Horas: ${campos.tituloTarea ?? "tarea"}`,
    });
    return { ok: true, pendiente: true };
  }
}
