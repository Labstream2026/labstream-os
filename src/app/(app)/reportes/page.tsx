import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { getTaskLabels } from "@/lib/workflow-labels";
import { statusMeta } from "@/lib/ui";
import { formatMinutes } from "@/lib/timeline";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const INACTIVE = ["CERRADO", "CANCELADO"];

export default async function ReportesPage() {
  const session = await getSession();
  if (!hasPermission(session, "ver_reportes")) redirect("/");

  const { statuses } = await getTaskLabels();
  const openKeys = statuses.filter((s) => !s.isDone).map((s) => s.key);

  const [activeProjects, openTasks, hoursAgg, activeMembers, byStatus, load, timeEntries] = await Promise.all([
    db.project.count({ where: { status: { notIn: INACTIVE as never } } }),
    db.task.count({ where: { status: { in: openKeys } } }),
    db.timeEntry.aggregate({ _sum: { minutes: true } }),
    db.user.count({ where: { active: true } }),
    db.project.groupBy({ by: ["status"], _count: { _all: true } }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: { in: openKeys }, assigneeId: { not: null } }, _count: { _all: true } }),
    db.timeEntry.findMany({ select: { minutes: true, task: { select: { project: { select: { id: true, name: true, emoji: true } } } } } }),
  ]);

  // Proyectos por estado (orden por cantidad).
  const statusRows = byStatus
    .map((r) => ({ status: r.status as string, count: r._count._all, meta: statusMeta(r.status as string) }))
    .sort((a, b) => b.count - a.count);
  const maxStatus = Math.max(1, ...statusRows.map((r) => r.count));

  // Horas registradas por proyecto (suma de TimeEntry → proyecto).
  const byProject = new Map<string, { name: string; emoji: string | null; minutes: number }>();
  for (const e of timeEntries) {
    const p = e.task.project;
    if (!p) continue;
    const cur = byProject.get(p.id) ?? { name: p.name, emoji: p.emoji, minutes: 0 };
    cur.minutes += e.minutes;
    byProject.set(p.id, cur);
  }
  const hoursByProject = [...byProject.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 8);
  const maxHours = Math.max(1, ...hoursByProject.map((p) => p.minutes));

  // Carga del equipo: tareas abiertas por persona.
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true, initials: true, avatarColor: true } });
  const loadRows = load
    .map((r) => ({ user: users.find((u) => u.id === r.assigneeId), count: r._count._all }))
    .filter((x): x is { user: (typeof users)[number]; count: number } => !!x.user)
    .sort((a, b) => b.count - a.count);
  const maxLoad = Math.max(1, ...loadRows.map((r) => r.count));

  const totalMinutes = hoursAgg._sum.minutes ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Reportes</h1>
      <p className="mt-1 text-sm text-muted-foreground">Vista general del estudio: proyectos, horas y carga del equipo.</p>

      {/* Métricas */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat emoji="🚀" value={activeProjects} label="Proyectos activos" />
        <Stat emoji="✅" value={openTasks} label="Tareas abiertas" />
        <Stat emoji="⏱" value={formatMinutes(totalMinutes)} label="Horas registradas" />
        <Stat emoji="👥" value={activeMembers} label="Miembros activos" />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Proyectos por estado */}
        <Section title="Proyectos por estado">
          {statusRows.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-2">
              {statusRows.map((r) => (
                <div key={r.status} className="flex items-center gap-3">
                  <Badge className={cn("w-36 shrink-0 justify-center text-[10px]", r.meta.className)}>{r.meta.label}</Badge>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${(r.count / maxStatus) * 100}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right text-sm font-medium">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Carga del equipo */}
        <Section title="Carga del equipo" hint="Tareas abiertas por persona">
          {loadRows.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-2.5">
              {loadRows.map((r) => (
                <div key={r.user.id} className="flex items-center gap-3">
                  <span className="flex w-40 shrink-0 items-center gap-2">
                    <UserAvatar initials={r.user.initials} color={r.user.avatarColor} size="sm" />
                    <span className="truncate text-sm">{r.user.name}</span>
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${(r.count / maxLoad) * 100}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right text-sm font-medium">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Horas por proyecto */}
        <Section title="Horas por proyecto" hint="Tiempo registrado (top 8)" full>
          {hoursByProject.length === 0 ? (
            <Empty text="Aún no hay horas registradas. Regístralas desde el detalle de una tarea." />
          ) : (
            <div className="space-y-2.5">
              {hoursByProject.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-48 shrink-0 truncate text-sm">{p.emoji} {p.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${(p.minutes / maxHours) * 100}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm font-medium">{formatMinutes(p.minutes)}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        <Link href="/proyectos" className="text-primary hover:underline">Ver proyectos</Link> · datos en tiempo real.
      </p>
    </div>
  );
}

function Stat({ emoji, value, label }: { emoji: string; value: number | string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <span className="text-xl">{emoji}</span>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

function Section({ title, hint, full, children }: { title: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5 shadow-sm", full && "lg:col-span-2")}>
      <h2 className="text-base font-semibold">{title}</h2>
      {hint ? <p className="mb-3 text-xs text-muted-foreground">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function Empty({ text = "Sin datos todavía." }: { text?: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}
