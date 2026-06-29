import Link from "next/link";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { getTaskLabels } from "@/lib/workflow-labels";
import { personCompliance } from "@/lib/compliance";
import { statusMeta, quoteTotals, formatMoney } from "@/lib/ui";
import { formatMinutes } from "@/lib/timeline";
import { effectiveInvoiceStatus } from "@/lib/billing";
import { UserAvatar } from "@/components/user-avatar";
import { Donut, Gauge, Legend, BarRow, SERIES, POS, WARN } from "@/components/charts";
import { cn } from "@/lib/utils";

// Cuerpo del DESEMPEÑO DEL EQUIPO (métricas del estudio, facturación, cumplimiento, carga,
// horas). Extraído de la página /reportes para reutilizarlo también como pestaña del Inicio.
// El que lo llama debe gatear con `ver_reportes`. Internamente respeta `ver_cumplimiento`.

const INACTIVE = ["CERRADO", "CANCELADO"];

export async function TeamPerformance({ session }: { session: SessionUser | null }) {
  const { statuses } = await getTaskLabels();
  const openKeys = statuses.filter((s) => !s.isDone).map((s) => s.key);

  const [activeProjects, openTasks, hoursAgg, activeMembers, byStatus, load, timeByTask, invoices] = await Promise.all([
    db.project.count({ where: { status: { notIn: INACTIVE as never } } }),
    db.task.count({ where: { status: { in: openKeys } } }),
    db.timeEntry.aggregate({ _sum: { minutes: true } }),
    db.user.count({ where: { active: true } }),
    db.project.groupBy({ by: ["status"], _count: { _all: true } }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: { in: openKeys }, assigneeId: { not: null } }, _count: { _all: true } }),
    db.timeEntry.groupBy({ by: ["taskId"], _sum: { minutes: true } }),
    db.invoice.findMany({ select: { status: true, taxRate: true, currency: true, dueDate: true, items: { select: { quantity: true, unitPrice: true } } } }),
  ]);

  // Facturación: total facturado, cobrado y por cobrar (ENVIADA + vencidas).
  const invRows = invoices.map((i) => ({ status: effectiveInvoiceStatus(i.status, i.dueDate), total: quoteTotals(i.items, i.taxRate).total }));
  const facturado = invRows.filter((r) => r.status !== "ANULADA").reduce((n, r) => n + r.total, 0);
  const cobrado = invRows.filter((r) => r.status === "PAGADA").reduce((n, r) => n + r.total, 0);
  const porCobrar = invRows.filter((r) => r.status === "ENVIADA" || r.status === "VENCIDA").reduce((n, r) => n + r.total, 0);
  const invCurrency = invoices[0]?.currency ?? "COP";

  const statusRows = byStatus
    .map((r) => ({ status: r.status as string, count: r._count._all, meta: statusMeta(r.status as string) }))
    .sort((a, b) => b.count - a.count);
  const totalStatus = statusRows.reduce((n, r) => n + r.count, 0);

  const taskIds = timeByTask.map((t) => t.taskId);
  const tasksForHours = taskIds.length
    ? await db.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, project: { select: { id: true, name: true, emoji: true } } } })
    : [];
  const projByTask = new Map(tasksForHours.map((t) => [t.id, t.project]));
  const byProject = new Map<string, { name: string; emoji: string | null; minutes: number }>();
  for (const row of timeByTask) {
    const p = projByTask.get(row.taskId);
    if (!p) continue;
    const cur = byProject.get(p.id) ?? { name: p.name, emoji: p.emoji, minutes: 0 };
    cur.minutes += row._sum.minutes ?? 0;
    byProject.set(p.id, cur);
  }
  const hoursByProject = [...byProject.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 8);
  const maxHours = Math.max(1, ...hoursByProject.map((p) => p.minutes));

  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true, initials: true, avatarColor: true } });
  const loadRows = load
    .map((r) => ({ user: users.find((u) => u.id === r.assigneeId), count: r._count._all }))
    .filter((x): x is { user: (typeof users)[number]; count: number } => !!x.user)
    .sort((a, b) => b.count - a.count);
  const maxLoad = Math.max(1, ...loadRows.map((r) => r.count));

  const totalMinutes = hoursAgg._sum.minutes ?? 0;

  const canCumplimiento = hasPermission(session, "ver_cumplimiento");
  const compliance = canCumplimiento ? await personCompliance() : [];

  return (
    <>
      {/* Métricas */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat emoji="🚀" value={activeProjects} label="Proyectos activos" />
        <Stat emoji="✅" value={openTasks} label="Tareas abiertas" />
        <Stat emoji="⏱" value={formatMinutes(totalMinutes)} label="Horas registradas" />
        <Stat emoji="👥" value={activeMembers} label="Miembros activos" />
      </div>

      {invoices.length > 0 && hasPermission(session, "ver_finanzas") ? (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Facturación</h2>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
            <Gauge pct={facturado > 0 ? (cobrado / facturado) * 100 : 0} label="cobrado" />
            <div className="min-w-56 flex-1 space-y-2.5">
              <div className="flex h-3.5 overflow-hidden rounded-full" style={{ background: "hsl(var(--muted))" }}>
                <div className="h-full" style={{ width: `${facturado > 0 ? (cobrado / facturado) * 100 : 0}%`, background: POS }} />
                <div className="h-full" style={{ width: `${facturado > 0 ? (porCobrar / facturado) * 100 : 0}%`, background: WARN }} />
              </div>
              <Legend items={[{ label: "Cobrado", value: formatMoney(cobrado, invCurrency), color: POS }, { label: "Por cobrar", value: formatMoney(porCobrar, invCurrency), color: WARN }]} />
              <p className="border-t border-border pt-2 text-sm"><span className="text-muted-foreground">Facturado total:</span> <span className="font-semibold tabular-nums">{formatMoney(facturado, invCurrency)}</span></p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {canCumplimiento ? (
          <Section title="Cumplimiento del equipo" hint="Tareas con fecha entregadas a tiempo vs. tarde o vencidas" full>
            {compliance.length === 0 ? (
              <Empty text="Aún no hay tareas con fecha de entrega asignadas." />
            ) : (
              <div className="space-y-2.5">
                {compliance.map((r) => (
                  <div key={r.user.id} className="flex items-center gap-3">
                    <span className="flex w-28 shrink-0 items-center gap-2 sm:w-44">
                      <UserAvatar initials={r.user.initials} color={r.user.avatarColor} size="sm" />
                      <span className="truncate text-sm">{r.user.name}</span>
                    </span>
                    <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted" title={`${r.onTime} a tiempo · ${r.late} tarde · ${r.overdueOpen} vencidas`}>
                      <div className="h-full bg-emerald-500/80" style={{ width: `${(r.onTime / Math.max(1, r.judged)) * 100}%` }} />
                      <div className="h-full bg-amber-500/80" style={{ width: `${(r.late / Math.max(1, r.judged)) * 100}%` }} />
                      <div className="h-full bg-rose-500/80" style={{ width: `${(r.overdueOpen / Math.max(1, r.judged)) * 100}%` }} />
                    </div>
                    <span className="hidden w-40 shrink-0 gap-2 text-right text-[11px] text-muted-foreground sm:flex sm:justify-end">
                      <span className="text-emerald-600 dark:text-emerald-400">{r.onTime}✓</span>
                      <span className="text-amber-600 dark:text-amber-400">{r.late} tarde</span>
                      <span className="text-rose-600 dark:text-rose-400">{r.overdueOpen} venc.</span>
                    </span>
                    <span className={cn("w-12 shrink-0 text-right text-sm font-bold", pctTone(r.pct))}>
                      {r.pct === null ? "—" : `${r.pct}%`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        ) : null}

        <Section title="Proyectos por estado">
          {statusRows.length === 0 ? (
            <Empty />
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-5 sm:justify-start">
              <Donut
                segments={statusRows.map((r, i) => ({ label: r.meta.label, value: r.count, color: SERIES[i % SERIES.length] }))}
                centerValue={totalStatus}
                centerLabel="proyectos"
              />
              <Legend
                vertical
                className="flex-1"
                items={statusRows.map((r, i) => ({ label: r.meta.label, value: r.count, color: SERIES[i % SERIES.length] }))}
              />
            </div>
          )}
        </Section>

        <Section title="Carga del equipo" hint="Tareas abiertas por persona">
          {loadRows.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-2.5">
              {loadRows.map((r) => (
                <BarRow
                  key={r.user.id}
                  icon={<UserAvatar initials={r.user.initials} color={r.user.avatarColor} size="sm" />}
                  label={r.user.name}
                  value={r.count}
                  pct={(r.count / maxLoad) * 100}
                  color={maxLoad > 3 && r.count >= maxLoad * 0.85 ? WARN : "hsl(var(--primary))"}
                />
              ))}
            </div>
          )}
        </Section>

        <Section title="Horas por proyecto" hint="Tiempo registrado (top 8)" full>
          {hoursByProject.length === 0 ? (
            <Empty text="Aún no hay horas registradas. Regístralas desde el detalle de una tarea." />
          ) : (
            <div className="space-y-2.5">
              {hoursByProject.map((p, i) => (
                <BarRow
                  key={i}
                  label={`${p.emoji ?? "📁"} ${p.name}`}
                  value={formatMinutes(p.minutes)}
                  pct={(p.minutes / maxHours) * 100}
                  color={POS}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        <Link href="/proyectos" className="text-primary hover:underline">Ver proyectos</Link> · datos en tiempo real.
      </p>
    </>
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

// Color del % de cumplimiento: verde ≥85, ámbar ≥60, rojo por debajo.
function pctTone(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 85) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}
