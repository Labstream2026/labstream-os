import { db } from "@/lib/db";
import { tone } from "@/lib/colors";
import { getTaskLabels } from "@/lib/workflow-labels";
import { dayKey, resolveSpan, minMaxKeys, taskLifeSpan } from "@/lib/timeline";
import { canAccessProject, canWriteProject } from "@/lib/project-access";
import type { SessionUser } from "@/lib/session";
import type { GTClient, GTMilestone } from "@/app/(app)/timeline/global-timeline";

// Construye los datos del cronograma general (proyectos por cliente + hitos) para una
// sesión, respetando acceso y privacidad. Lo comparten el Cronograma general (/timeline)
// y el resumen del Inicio, para no duplicar la lógica de fechas/spans.
const PROJECT_TONES = ["indigo", "sky", "violet", "amber", "emerald", "rose", "cyan", "orange", "teal", "fuchsia"];
const accessSelect = { isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } as const;

// Estados que no se muestran en el resumen "activo" del Inicio.
const INACTIVE_STATUSES = ["CERRADO", "CANCELADO"];

export async function buildSessionTimeline(
  session: SessionUser | null,
  opts?: { activeOnly?: boolean },
): Promise<{ clients: GTClient[]; milestones: GTMilestone[]; undatedCount: number }> {
  const [projects, taskLabels] = await Promise.all([
    db.project.findMany({
      where: opts?.activeOnly ? { status: { notIn: INACTIVE_STATUSES as never } } : undefined,
      orderBy: [{ clientId: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        emoji: true,
        color: true,
        progress: true,
        startDate: true,
        dueDate: true,
        ...accessSelect,
        client: { select: { id: true, name: true, emoji: true } },
        deliverables: { where: { dueDate: { not: null } }, select: { id: true, name: true, dueDate: true } },
        tasks: {
          orderBy: { position: "asc" },
          select: {
            id: true, title: true, status: true, startDate: true, dueDate: true, shootDate: true,
            createdAt: true, completedAt: true, isPrivate: true, ownerId: true, assigneeId: true,
            assignee: { select: { initials: true, avatarColor: true } },
            checklist: { select: { done: true } },
          },
        },
      },
    }),
    getTaskLabels(),
  ]);

  const doneKeys = new Set(taskLabels.statuses.filter((s) => s.isDone).map((s) => s.key));
  const accessible = projects.filter((p) => canAccessProject(p, session));

  const clientMap = new Map<string, GTClient>();
  const milestones: GTMilestone[] = [];
  let idx = 0;
  const mine = (t: { ownerId: string | null; assigneeId: string | null }) =>
    t.ownerId === session?.id || t.assigneeId === session?.id;

  for (const p of accessible) {
    const hex = tone(p.color ?? PROJECT_TONES[idx % PROJECT_TONES.length]).hex;
    idx++;
    let lane = clientMap.get(p.client.id);
    if (!lane) {
      lane = { id: p.client.id, label: `${p.client.emoji ?? "📁"} ${p.client.name}`, projects: [] };
      clientMap.set(p.client.id, lane);
    }

    const childKeys: (string | null)[] = [];
    const tasks = p.tasks
      .filter((t) => !t.isPrivate || mine(t))
      .map((t) => {
        const { startKey, endKey } = taskLifeSpan(t);
        childKeys.push(startKey, endKey);
        const done = doneKeys.has(t.status);
        const total = t.checklist.length;
        const checked = t.checklist.filter((c) => c.done).length;
        const progress = done ? 100 : total ? Math.round((checked / total) * 100) : 0;
        return {
          id: t.id,
          title: t.title,
          startKey,
          endKey,
          done,
          progress,
          assignee: t.assignee ? { initials: t.assignee.initials, color: t.assignee.avatarColor } : null,
        };
      });

    for (const d of p.deliverables) childKeys.push(dayKey(d.dueDate));
    const { min: childMin, max: childMax } = minMaxKeys(childKeys);
    const span = resolveSpan(dayKey(p.startDate) ?? childMin, dayKey(p.dueDate) ?? childMax, childMin, childMax);
    lane.projects.push({
      id: p.id,
      name: `${p.emoji ?? "🎬"} ${p.name}`,
      startKey: span.startKey,
      endKey: span.endKey,
      colorHex: hex,
      progress: p.progress,
      editable: canWriteProject(p, session),
      tasks,
    });

    for (const d of p.deliverables) {
      const k = dayKey(d.dueDate);
      if (k) milestones.push({ id: `deliv-${d.id}`, dayKey: k, label: `${p.name} · ${d.name}`, emoji: "📦", colorHex: tone("emerald").hex });
    }
    for (const t of p.tasks) {
      if (t.isPrivate && !mine(t)) continue;
      const k = dayKey(t.shootDate);
      if (k) milestones.push({ id: `shoot-${t.id}`, dayKey: k, label: `${p.name} · ${t.title}`, emoji: "🎬", colorHex: tone("rose").hex });
    }
  }

  const clients = [...clientMap.values()].filter((c) => c.projects.length > 0);
  const undatedCount = clients.reduce((n, c) => n + c.projects.filter((p) => !p.startKey && !p.endKey).length, 0);
  return { clients, milestones, undatedCount };
}
