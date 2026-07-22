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
      select: { id: true, name: true, initials: true, avatarColor: true, weeklyCapacityHours: true, role: { select: { key: true } } },
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
        estimatedMinutes: true,
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

  // ── CARGA DEL EQUIPO (Tareas 2.0, Fase 2): horas ESTIMADAS de las tareas abiertas visibles
  // por persona vs su capacidad semanal (User.weeklyCapacityHours, 40 por defecto). Las tareas
  // sin estimación no pesan (por eso se muestra también cuántas son) — estimar es lo que hace
  // útil esta vista. Sin clientes del portal ni gente sin trabajo asignado.
  const loadOf = new Map<string, { min: number; unsized: number }>();
  for (const t of visible) {
    if (!t.assigneeId) continue;
    const cur = loadOf.get(t.assigneeId) ?? { min: 0, unsized: 0 };
    if (t.estimatedMinutes) cur.min += t.estimatedMinutes;
    else cur.unsized += 1;
    loadOf.set(t.assigneeId, cur);
  }
  const workRows = team
    .filter((u) => u.role?.key !== "cliente" && loadOf.has(u.id))
    .map((u) => {
      const l = loadOf.get(u.id)!;
      const hours = Math.round((l.min / 60) * 10) / 10;
      const cap = u.weeklyCapacityHours || 40;
      return { ...u, hours, cap, pct: Math.round((hours / cap) * 100), unsized: l.unsized };
    })
    .sort((a, b) => b.pct - a.pct);

  return (
    <div className="space-y-5">
      {workRows.length ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Carga del equipo <span className="font-normal normal-case">· horas estimadas abiertas vs capacidad semanal</span>
          </p>
          <div className="space-y-3">
            {workRows.map((u) => (
              <div key={u.id}>
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: tone(u.avatarColor ?? "slate").hex }}>{u.initials ?? "?"}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                  <span className={cnLoad(u.pct)}>
                    {u.hours}h / {u.cap}h · {u.pct}%{u.pct >= 100 ? " · sobrecarga" : ""}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={u.pct >= 100 ? "h-full rounded-full bg-red-500" : u.pct >= 75 ? "h-full rounded-full bg-amber-500" : "h-full rounded-full bg-indigo-500"}
                    style={{ width: `${Math.min(100, u.pct)}%` }}
                  />
                </div>
                {u.unsized ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">+ {u.unsized} tarea{u.unsized === 1 ? "" : "s"} sin estimación (no pesan aquí)</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <TeamTasksBoard members={members} tasks={tasks} canReassign={canReassign} canEditDates={canEditDates} />
    </div>
  );
}

// Tono del número de carga: rojo desde 100%, ámbar desde 75%.
function cnLoad(pct: number): string {
  return pct >= 100
    ? "shrink-0 text-xs font-semibold text-red-600 dark:text-red-400"
    : pct >= 75
      ? "shrink-0 text-xs font-semibold text-amber-600 dark:text-amber-400"
      : "shrink-0 text-xs text-muted-foreground";
}
