import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { canAccessProject } from "@/lib/project-access";
import { getTaskLabels } from "@/lib/workflow-labels";
import { tone } from "@/lib/colors";
import { TeamTasksBoard, type TeamTask } from "./team-tasks-board";

// Compilado de TAREAS DEL EQUIPO para el Inicio: todas las tareas ABIERTAS (estado no "hecho")
// agrupadas por responsable, interactivo (reasignar + cambiar fecha de entrega). Respeta la
// privacidad: solo muestra tareas de proyectos accesibles (admin ve todo). El que lo llama
// debe gatear con ver_reportes (igual que Desempeño del equipo).
export async function TeamTasks({ session }: { session: SessionUser | null }) {
  const { statuses } = await getTaskLabels();
  const openKeys = statuses.filter((s) => !s.isDone).map((s) => s.key);
  const statusMetaMap = new Map(statuses.map((s) => [s.key, { label: s.label, chip: tone(s.color).chip }]));

  const projAccess = { id: true, name: true, emoji: true, isPrivate: true, leadId: true, members: { select: { userId: true } } } as const;
  const [team, rows] = await Promise.all([
    db.user.findMany({
      where: { active: true, isSystemBot: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, initials: true, avatarColor: true },
    }),
    db.task.findMany({
      where: { status: { in: openKeys } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 1000,
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        dueTime: true,
        assigneeId: true,
        isPrivate: true,
        ownerId: true,
        projectId: true,
        project: { select: projAccess },
      },
    }),
  ]);

  const isAdmin = session?.role === "admin";
  const mine = (t: { ownerId: string | null; assigneeId: string | null }) => t.ownerId === session?.id || t.assigneeId === session?.id;
  // Privacidad: admin ve todo; el resto solo tareas de proyectos accesibles (o personales suyas).
  const visible = rows.filter((t) => {
    if (isAdmin) return true;
    if (!t.project) return mine(t);
    if (t.isPrivate && !mine(t)) return false;
    return canAccessProject(t.project, session) || mine(t);
  });

  const tasks: TeamTask[] = visible.map((t) => {
    const meta = statusMetaMap.get(t.status);
    return {
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      projectName: t.project?.name ?? null,
      projectEmoji: t.project?.emoji ?? null,
      assigneeId: t.assigneeId,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      dueTime: t.dueTime ?? null,
      statusLabel: meta?.label ?? t.status,
      statusClass: meta?.chip ?? "bg-muted text-muted-foreground",
    };
  });

  const members = team.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }));
  const canReassign = hasPermission(session, "editar_tareas");
  const canEditDates = hasPermission(session, "gestionar_cronograma");

  return <TeamTasksBoard members={members} tasks={tasks} canReassign={canReassign} canEditDates={canEditDates} />;
}
