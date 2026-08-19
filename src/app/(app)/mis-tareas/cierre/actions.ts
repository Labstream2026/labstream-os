"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { ventanaHoyBogota, minutosTxt } from "@/lib/cierre/datos";

// ── Anotar el cierre del día ─────────────────────────────────────────────────
// Convierte el reparto (taskId → minutos) en registros de horas de verdad — los MISMOS
// TimeEntry del cronómetro y de logTime, con nota «Cierre del día» y anclados al mediodía
// de Bogotá de hoy. Solo suma: cerrar dos veces no duplica nada porque la pantalla resta
// lo ya anotado antes de sugerir.

const MAX_POR_TAREA = 12 * 60; // 12 h en una tarea en un día ya es sospechoso de dedo
const MAX_DIA = 18 * 60; // tope duro del día completo (nadie anota 19 h de una sentada)

export async function cerrarDia(formData: FormData): Promise<{ ok: boolean; error?: string; resumen?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado." };

  // Filas min-<taskId> = minutos. Se ignoran vacíos y ceros; se valida el resto.
  const filas: { taskId: string; minutos: number }[] = [];
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("min-")) continue;
    const taskId = k.slice(4);
    const minutos = Math.round(Number(String(v).trim() || "0"));
    if (!taskId || !Number.isFinite(minutos) || minutos <= 0) continue;
    if (minutos > MAX_POR_TAREA) return { ok: false, error: `Más de 12 h en una sola tarea no parece real. Revisa los minutos.` };
    filas.push({ taskId, minutos });
  }
  if (filas.length === 0) return { ok: false, error: "No hay minutos que anotar: pon tiempo en al menos una tarea." };
  const total = filas.reduce((s, f) => s + f.minutos, 0);
  if (total > MAX_DIA) return { ok: false, error: "El total supera las 18 h del día. Revisa los minutos." };

  // Cada tarea debe ser MÍA (responsable o dueño) — la misma regla del cronómetro. El
  // formulario ya solo lista las mías, pero la acción se puede invocar directo.
  const tareas = await db.task.findMany({
    where: { id: { in: filas.map((f) => f.taskId) } },
    select: { id: true, title: true, assigneeId: true, ownerId: true, project: { select: { id: true } } },
  });
  const tareaDe = new Map(tareas.map((t) => [t.id, t]));
  const esAdmin = session.role === "admin";
  for (const f of filas) {
    const t = tareaDe.get(f.taskId);
    if (!t) return { ok: false, error: "Una de las tareas ya no existe. Recarga la página." };
    if (t.assigneeId !== session.id && t.ownerId !== session.id && !esAdmin) {
      return { ok: false, error: `«${t.title}» no es tuya: solo el responsable o el dueño anotan horas en ella.` };
    }
  }

  const { noon } = ventanaHoyBogota();
  await db.timeEntry.createMany({
    data: filas.map((f) => ({ taskId: f.taskId, userId: session.id, minutes: f.minutos, note: "Cierre del día", spentOn: noon })),
  });

  await logActivity({
    action: "task.time",
    summary: `cerró su día: ${minutosTxt(total)} repartidas en ${filas.length} tarea${filas.length === 1 ? "" : "s"}`,
    entityType: "task",
  }).catch(() => null);

  revalidatePath("/mis-tareas");
  revalidatePath("/mis-tareas/cierre");
  const proyectos = new Set(tareas.map((t) => t.project?.id).filter(Boolean) as string[]);
  for (const id of proyectos) revalidatePath(`/proyectos/${id}`);

  return { ok: true, resumen: `${minutosTxt(total)} anotadas en ${filas.length} tarea${filas.length === 1 ? "" : "s"}. Día cuadrado.` };
}
