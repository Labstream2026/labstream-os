import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject, canWriteProject } from "@/lib/project-access";
import { tone } from "@/lib/colors";
import { dayKey } from "@/lib/timeline";
import { GlobalTimeline, type GTClient, type GTMilestone } from "./global-timeline";

export const dynamic = "force-dynamic";

// Paleta por defecto para proyectos sin color asignado.
const PROJECT_TONES = ["indigo", "sky", "violet", "amber", "emerald", "rose", "cyan", "orange", "teal", "fuchsia"];

const accessSelect = { isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } as const;

export default async function TimelinePage() {
  const session = await getSession();

  const projects = await db.project.findMany({
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
        where: { shootDate: { not: null } },
        select: { id: true, title: true, shootDate: true, isPrivate: true, ownerId: true, assigneeId: true },
      },
    },
  });

  const accessible = projects.filter((p) => canAccessProject(p, session));

  // Agrupar proyectos por cliente.
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
    lane.projects.push({
      id: p.id,
      name: `${p.emoji ?? "🎬"} ${p.name}`,
      startKey: dayKey(p.startDate),
      endKey: dayKey(p.dueDate),
      colorHex: hex,
      progress: p.progress,
      editable: canWriteProject(p, session),
    });
    // Entregas del proyecto.
    for (const d of p.deliverables) {
      const k = dayKey(d.dueDate);
      if (k) milestones.push({ id: `deliv-${d.id}`, dayKey: k, label: `${p.name} · ${d.name}`, emoji: "📦", colorHex: tone("emerald").hex });
    }
    // Rodajes (respetando privacidad de tarea).
    for (const t of p.tasks) {
      if (t.isPrivate && !mine(t)) continue;
      const k = dayKey(t.shootDate);
      if (k) milestones.push({ id: `shoot-${t.id}`, dayKey: k, label: `${p.name} · ${t.title}`, emoji: "🎬", colorHex: tone("rose").hex });
    }
  }

  const clients = [...clientMap.values()].filter((c) => c.projects.length > 0);
  const undatedCount = clients.reduce((n, c) => n + c.projects.filter((p) => !p.startKey && !p.endKey).length, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Cronograma general</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Línea de tiempo de todos los proyectos del estudio, con rodajes y entregas. Arrastra la barra de un proyecto para reprogramarlo o haz clic para abrirlo.
          {undatedCount > 0 ? ` · ${undatedCount} proyecto${undatedCount === 1 ? "" : "s"} sin fechas (asígnalas dentro del proyecto).` : ""}
        </p>
      </div>
      <GlobalTimeline clients={clients} milestones={milestones} />
    </div>
  );
}
