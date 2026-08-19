"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessProject, PROJECT_ACCESS_SELECT } from "@/lib/project-access";
import { notifyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { syncTaskAnchoredAlerts } from "@/lib/reminder-alerts";

// ── La CASCADA del cronograma ───────────────────────────────────────────────
// Las dependencias funcionaban como candado (no cierras con bloqueadoras abiertas) pero eran
// ciegas al calendario: mover el rodaje movía UNA tarea y nada de lo que colgaba se enteraba.
// Aquí, al mover una tarea con dependientes, se calcula la cadena y se ofrece arrastrarla —
// y al equipo le llega UN aviso por persona con TODAS sus tareas movidas, no una ráfaga.

const fmt = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });
const dia = (d: Date | null) => (d ? fmt.format(d).replace(".", "") : "—");

async function guardia(projectId: string) {
  const session = await getSession();
  if (!session || !hasPermission(session, "gestionar_cronograma")) return null;
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { ...PROJECT_ACCESS_SELECT, id: true, name: true, dueDate: true },
  });
  if (!project || !canAccessProject(project, session)) return null;
  return { session, project };
}

export type FilaCascada = {
  id: string;
  title: string;
  inicio: string | null; // «28 ago», ya formateado
  fin: string | null;
  asignadoNombre: string | null;
  /** Su entrega coincide con la del PROYECTO: es el compromiso con el cliente y no se mueve
   *  solo — sale desmarcada y moverla es una decisión a propósito. */
  compromisoCliente: boolean;
};

/**
 * La cadena TRANSITIVA de tareas abiertas que dependen de esta (lo que ella bloquea, lo que
 * eso bloquea, etc.), dentro del mismo proyecto. BFS con tope de cordura.
 */
export async function dependientesDe(taskId: string, projectId: string): Promise<{ filas: FilaCascada[]; entregaProyecto: string | null }> {
  const g = await guardia(projectId);
  if (!g) return { filas: [], entregaProyecto: null };

  const vistos = new Set<string>([taskId]);
  let frontera = [taskId];
  const encontrados: string[] = [];
  for (let nivel = 0; nivel < 10 && frontera.length; nivel++) {
    const deps = await db.taskDependency.findMany({
      where: { blockerId: { in: frontera }, task: { projectId, completedAt: null } },
      select: { taskId: true },
    });
    frontera = deps.map((d) => d.taskId).filter((id) => !vistos.has(id));
    for (const id of frontera) {
      vistos.add(id);
      encontrados.push(id);
    }
  }
  if (!encontrados.length) return { filas: [], entregaProyecto: dia(g.project.dueDate) === "—" ? null : dia(g.project.dueDate) };

  const tareas = await db.task.findMany({
    where: { id: { in: encontrados } },
    orderBy: [{ dueDate: "asc" }],
    select: { id: true, title: true, startDate: true, dueDate: true, assignee: { select: { name: true } } },
  });
  const entregaMs = g.project.dueDate?.getTime() ?? null;
  return {
    entregaProyecto: g.project.dueDate ? dia(g.project.dueDate) : null,
    filas: tareas.map((t) => ({
      id: t.id,
      title: t.title,
      inicio: t.startDate ? dia(t.startDate) : null,
      fin: t.dueDate ? dia(t.dueDate) : null,
      asignadoNombre: t.assignee?.name ?? null,
      compromisoCliente: entregaMs !== null && t.dueDate !== null && t.dueDate.getTime() >= entregaMs,
    })),
  };
}

/**
 * Corre las tareas elegidas el mismo delta (días calendario) que se corrió el origen, y avisa
 * AGRUPADO: un mensaje por persona con todas sus tareas movidas, quién movió, por qué, y si
 * la entrega al cliente se mantiene — que es lo primero que va a preguntar quien lo reciba.
 */
export async function aplazarCascada(input: {
  projectId: string;
  origenTitulo: string;
  deltaDias: number;
  ids: string[];
}): Promise<{ ok: boolean; movidas: number; error?: string }> {
  const g = await guardia(input.projectId);
  if (!g) return { ok: false, movidas: 0, error: "Sin permiso para mover el cronograma." };
  const delta = Math.trunc(input.deltaDias);
  if (!delta || !input.ids.length) return { ok: true, movidas: 0 };
  if (Math.abs(delta) > 120) return { ok: false, movidas: 0, error: "Ese corrimiento no parece real (más de 120 días)." };

  // Solo tareas ABIERTAS de ESTE proyecto: los ids vienen del navegador.
  const tareas = await db.task.findMany({
    where: { id: { in: input.ids.slice(0, 60) }, projectId: input.projectId, completedAt: null },
    select: { id: true, title: true, startDate: true, dueDate: true, assigneeId: true },
  });
  if (!tareas.length) return { ok: true, movidas: 0 };

  const mover = (d: Date | null) => (d ? new Date(d.getTime() + delta * 86_400_000) : null);
  const movidas: { title: string; de: string; a: string; assigneeId: string | null }[] = [];
  for (const t of tareas) {
    const nuevoIni = mover(t.startDate);
    const nuevoFin = mover(t.dueDate);
    await db.task.update({ where: { id: t.id }, data: { startDate: nuevoIni, dueDate: nuevoFin } });
    await syncTaskAnchoredAlerts(t.id).catch(() => {});
    movidas.push({ title: t.title, de: dia(t.dueDate), a: dia(nuevoFin), assigneeId: t.assigneeId });
  }

  // UN aviso por persona, no una ráfaga por tarea: tres cambios sueltos sin explicación
  // parecen un error del sistema; uno solo con el porqué es un plan que se movió.
  const porPersona = new Map<string, typeof movidas>();
  for (const m of movidas) {
    if (!m.assigneeId || m.assigneeId === g.session.id) continue;
    const arr = porPersona.get(m.assigneeId) ?? [];
    arr.push(m);
    porPersona.set(m.assigneeId, arr);
  }
  const entregaTxt = g.project.dueDate ? `La entrega al cliente sigue el ${dia(g.project.dueDate)}.` : "";
  await Promise.all(
    [...porPersona.entries()].map(([userId, suyas]) =>
      notifyAndEmail(userId, {
        type: "task",
        event: "task_schedule",
        title: `Se corrió «${input.origenTitulo}» en ${g.project.name}`,
        body: `${g.session.name} la movió ${delta > 0 ? `+${delta}` : delta} día${Math.abs(delta) > 1 ? "s" : ""} y tus tareas se corrieron con ella: ${suyas
          .map((m) => `${m.title} (${m.de} → ${m.a})`)
          .join(" · ")}. ${entregaTxt}`.trim(),
        link: `/proyectos/${input.projectId}?tab=cronograma`,
        actorId: g.session.id,
        groupKey: `cascada:${input.projectId}`,
      }),
    ),
  );

  await logActivity({
    action: "task.cascade",
    summary: `corrió ${movidas.length} tarea${movidas.length > 1 ? "s" : ""} ${delta > 0 ? `+${delta}` : delta} d tras mover «${input.origenTitulo}»`,
    projectId: input.projectId,
    entityType: "project",
    entityId: input.projectId,
  }).catch(() => {});

  revalidatePath(`/proyectos/${input.projectId}`);
  return { ok: true, movidas: movidas.length };
}
