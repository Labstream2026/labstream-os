import { db } from "@/lib/db";
import { notifyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { getTaskLabels } from "@/lib/workflow-labels";
import { bogotaNoon } from "@/lib/today";
import { parseTaskText } from "@/lib/task-parse";
import type { SessionUser } from "@/lib/session";

// NÚCLEO del quick-add de tareas (Tareas 2.0, Fase 3): una frase en español → tarea creada.
// Compartido por el server action (Mis tareas / proyecto), el endpoint /api/v1/tasks/quick y,
// vía catálogo, las herramientas de Marcebot/MCP. El ACCESO al proyecto lo valida cada
// envoltorio ANTES de llamar aquí (server action con ensureProjectAccess; API con
// canWriteProject); este núcleo asume pid ya autorizado y hace el resto: parsear, resolver
// @persona y !prioridad, crear, avisar y dejar rastro. No revalida rutas (eso es del caller).
export async function quickCreateFromText(
  session: SessionUser,
  rawText: string,
  pid: string | null,
): Promise<{ ok: boolean; error?: string; taskId?: string; title?: string }> {
  const text = rawText.trim().slice(0, 300);
  if (!text) return { ok: false, error: "Escribe la tarea." };
  const parsed = parseTaskText(text, Date.now());
  if (!parsed.title) return { ok: false, error: "Falta el título (los tokens solos no bastan)." };

  // Responsable: @query por prefijo de nombre. El portal cliente solo se asigna a sí mismo.
  let assigneeId = session.id;
  if (parsed.assigneeQuery && session.role !== "cliente") {
    const q = parsed.assigneeQuery.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const users = await db.user.findMany({
      where: { active: true, isSystemBot: false, role: { isNot: { key: "cliente" } } },
      select: { id: true, name: true },
    });
    const normed = (x: string) => x.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const hit =
      users.find((u) => normed(u.name).startsWith(q)) ??
      users.find((u) => normed(u.name).split(/\s+/).some((w) => w.startsWith(q)));
    if (!hit) return { ok: false, error: `No encuentro a «@${parsed.assigneeQuery}» en el equipo.` };
    assigneeId = hit.id;
  }

  // Prioridad contra el catálogo; «urgente» cae a la más alta.
  let priority = "MEDIA";
  if (parsed.priorityQuery) {
    const { priorities } = await getTaskLabels();
    const q = parsed.priorityQuery.toLowerCase();
    const hit =
      priorities.find((x) => x.label.toLowerCase().startsWith(q) || x.key.toLowerCase().startsWith(q)) ??
      (q === "urgente" ? priorities.find((x) => x.key === "ALTA") : undefined);
    if (hit) priority = hit.key;
  }

  const dueDate = parsed.dueYmd ? new Date(`${parsed.dueYmd}T12:00:00.000Z`) : bogotaNoon();
  const position = pid ? await db.task.count({ where: { projectId: pid } }) : 0;
  const task = await db.task.create({
    data: {
      title: parsed.title,
      priority: priority as never,
      startDate: bogotaNoon(),
      dueDate,
      dueTime: parsed.dueTime,
      estimatedMinutes: parsed.estimatedMinutes,
      assigneeId,
      ownerId: session.id,
      assignedById: assigneeId !== session.id ? session.id : null,
      projectId: pid,
      position,
      ...(parsed.tags.length ? { tags: { create: parsed.tags.map((label) => ({ label })) } } : {}),
    },
  });
  if (assigneeId !== session.id) {
    await notifyAndEmail(assigneeId, {
      type: "task",
      event: "task_assigned",
      title: `Nueva tarea: ${parsed.title}`,
      body: pid ? "Te la asignaron desde el proyecto." : "Te la asignaron desde Mis tareas.",
      link: pid ? `/proyectos/${pid}?tab=tareas` : "/mis-tareas",
      actorId: session.id,
    }).catch(() => null);
  }
  await logActivity({ action: "task.create", summary: `creó la tarea «${parsed.title}»`, projectId: pid, entityType: "task", entityId: task.id });
  return { ok: true, taskId: task.id, title: parsed.title };
}
