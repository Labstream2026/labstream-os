"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { setTaskStatus, setTaskDueDate } from "@/app/(app)/proyectos/[id]/actions";
import { toggleMyDay } from "./actions";

// ── Acciones en lote de «Mis tareas» (extra 8) ─────────────────────────────────
// Posponer nueve tareas una semana eran nueve gestos: abrir el selector de fecha de cada fila,
// elegir el día, esperar. Con la casilla en la fila, uno.
//
// DECISIÓN IMPORTANTE: cada acción en lote NO habla con la base de datos por su cuenta — llama en
// bucle a la acción de UNA tarea que ya existe y ya está auditada (setTaskStatus, setTaskDueDate,
// toggleMyDay). Son N consultas en vez de una sola, y para un puñado de tareas marcadas eso da
// igual; lo que se gana es que es IMPOSIBLE que el camino en lote se salte un permiso, el candado
// de dependencias, el registro de actividad, el recálculo del progreso del proyecto o el aviso de
// desbloqueo en cascada. Un `updateMany` sería más rápido y se saltaría las cinco cosas.

const TOPE = 100; // nadie marca más de esto a mano; el tope es contra un cliente manipulado

export type ResultadoLote = { ok: boolean; hechas: number; omitidas: number; error?: string };

// Solo MIS tareas: las que tengo asignadas o que yo creé. Es el mismo criterio con el que la
// pantalla las lista, así que el lote nunca puede alcanzar una tarea que no sale en la lista.
// Las acciones de dentro vuelven a comprobar el acceso al proyecto por su cuenta.
async function misIds(ids: string[]): Promise<{ mios: string[]; fuera: number; userId: string } | null> {
  const session = await getSession();
  if (!session) return null;
  const limpios = [...new Set(ids.filter((s) => typeof s === "string" && s.length > 0))].slice(0, TOPE);
  if (limpios.length === 0) return { mios: [], fuera: 0, userId: session.id };
  const filas = await db.task.findMany({
    where: { id: { in: limpios }, OR: [{ assigneeId: session.id }, { ownerId: session.id }] },
    select: { id: true },
  });
  return { mios: filas.map((f) => f.id), fuera: limpios.length - filas.length, userId: session.id };
}

// Cambiar el estado de varias. Respeta el candado: una tarea bloqueada no se completa, y se cuenta
// como omitida en vez de tumbar el lote entero.
export async function bulkSetStatus(ids: string[], status: string): Promise<ResultadoLote> {
  const ctx = await misIds(ids);
  if (!ctx) return { ok: false, hechas: 0, omitidas: 0, error: "Sesión caducada." };
  if (!status.trim()) return { ok: false, hechas: 0, omitidas: 0, error: "Falta el estado." };
  let hechas = 0;
  let omitidas = ctx.fuera;
  let primerError: string | undefined;
  for (const id of ctx.mios) {
    try {
      const r = await setTaskStatus(id, "", status);
      if (r.ok) hechas++;
      else { omitidas++; primerError ??= r.error; }
    } catch (e) {
      omitidas++;
      primerError ??= e instanceof Error ? e.message : "No se pudo cambiar una tarea.";
    }
  }
  return { ok: hechas > 0, hechas, omitidas, error: hechas === 0 ? primerError ?? "No se pudo cambiar ninguna." : undefined };
}

// Posponer: empuja la entrega N días. Si la tarea no tenía fecha, cuenta desde HOY (es lo que se
// espera al posponer algo sin fecha: «que salte a la semana que viene»).
// La fecha solo la cambia quien asignó la tarea: setTaskDueDate lo exige y LANZA, así que cada
// una va en su try y las ajenas se cuentan como omitidas.
export async function bulkPostpone(ids: string[], dias: number): Promise<ResultadoLote> {
  const ctx = await misIds(ids);
  if (!ctx) return { ok: false, hechas: 0, omitidas: 0, error: "Sesión caducada." };
  const n = Math.trunc(dias);
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 365) {
    return { ok: false, hechas: 0, omitidas: 0, error: "Cuántos días no es válido." };
  }
  const filas = await db.task.findMany({ where: { id: { in: ctx.mios } }, select: { id: true, dueDate: true } });
  // El "hoy" se toma UNA vez para todo el lote: si se leyera por tarea, dos tareas sin fecha
  // podrían caer en días distintos al cruzar la medianoche.
  const hoy = new Date();
  let hechas = 0;
  let omitidas = ctx.fuera;
  let primerError: string | undefined;
  for (const t of filas) {
    const base = t.dueDate ?? hoy;
    const destino = new Date(base);
    destino.setDate(destino.getDate() + n);
    const ymd = `${destino.getFullYear()}-${String(destino.getMonth() + 1).padStart(2, "0")}-${String(destino.getDate()).padStart(2, "0")}`;
    const fd = new FormData();
    fd.set("dueDate", ymd);
    try {
      await setTaskDueDate(t.id, "", fd);
      hechas++;
    } catch (e) {
      omitidas++;
      primerError ??= e instanceof Error ? e.message : "No se pudo mover una fecha.";
    }
  }
  return { ok: hechas > 0, hechas, omitidas, error: hechas === 0 ? primerError ?? "No se pudo mover ninguna." : undefined };
}

// Meter varias en «Mi día». `toggleMyDay` alterna, así que se le pasan SOLO las que no están
// dentro (el cliente lo sabe); aun así se comprueba aquí para no quitar nada sin querer.
export async function bulkToMyDay(ids: string[]): Promise<ResultadoLote> {
  const ctx = await misIds(ids);
  if (!ctx) return { ok: false, hechas: 0, omitidas: 0, error: "Sesión caducada." };
  const yaDentro = new Set(
    (await db.myDayItem.findMany({ where: { userId: ctx.userId, taskId: { in: ctx.mios } }, select: { taskId: true } }))
      .map((m) => m.taskId),
  );
  let hechas = 0;
  let omitidas = ctx.fuera + yaDentro.size;
  for (const id of ctx.mios) {
    if (yaDentro.has(id)) continue;
    try {
      const r = await toggleMyDay(id);
      if (r.ok) hechas++;
      else omitidas++;
    } catch {
      omitidas++;
    }
  }
  return { ok: hechas > 0 || yaDentro.size > 0, hechas, omitidas };
}
