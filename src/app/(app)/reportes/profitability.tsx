import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { quoteTotals } from "@/lib/ui";
import { ProfitabilityTable } from "./profitability-table";

// Horas y rentabilidad por proyecto: para proyectos ACTIVOS compara minutos estimados
// (Task.estimatedMinutes) contra minutos reales (TimeEntry.minutes) y, si el usuario ve
// finanzas, lo cruza con lo facturado. La página /reportes ya gatea con `ver_reportes`.
// Sigue el patrón de agregación de team-performance (groupBy timeEntry por taskId → proyecto).

const INACTIVE = ["CERRADO", "CANCELADO"];

export async function HoursProfitability({ session }: { session: SessionUser | null }) {
  const canFin = hasPermission(session, "ver_finanzas");

  // Proyectos activos (con nombre y emoji para la tabla).
  const activeProjects = await db.project.findMany({
    where: { status: { notIn: INACTIVE as never } },
    select: { id: true, name: true, emoji: true },
  });
  const activeIds = new Set(activeProjects.map((p) => p.id));

  const [estByProject, timeByTask, invoices] = await Promise.all([
    // Estimado por proyecto = suma de Task.estimatedMinutes.
    db.task.groupBy({
      by: ["projectId"],
      where: { projectId: { not: null } },
      _sum: { estimatedMinutes: true },
    }),
    // Real por proyecto = suma de TimeEntry.minutes agrupada por tarea (luego mapeada a proyecto).
    db.timeEntry.groupBy({ by: ["taskId"], _sum: { minutes: true } }),
    // Facturado por proyecto (solo con permiso de finanzas).
    canFin
      ? db.invoice.findMany({
          where: { projectId: { not: null } },
          select: {
            projectId: true,
            taxRate: true,
            currency: true,
            items: { select: { quantity: true, unitPrice: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  // Estimado por projectId.
  const estByProjectId = new Map<string, number>();
  for (const r of estByProject) {
    if (!r.projectId) continue;
    estByProjectId.set(r.projectId, r._sum.estimatedMinutes ?? 0);
  }

  // Real por proyecto: mapear cada tarea a su proyecto y acumular minutos.
  const taskIds = timeByTask.map((t) => t.taskId);
  const tasksForHours = taskIds.length
    ? await db.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, projectId: true } })
    : [];
  const projByTask = new Map(tasksForHours.map((t) => [t.id, t.projectId]));
  const realByProjectId = new Map<string, number>();
  for (const row of timeByTask) {
    const pid = projByTask.get(row.taskId);
    if (!pid) continue;
    realByProjectId.set(pid, (realByProjectId.get(pid) ?? 0) + (row._sum.minutes ?? 0));
  }

  // Facturado por proyecto.
  const facturadoByProjectId = new Map<string, number>();
  for (const inv of invoices) {
    if (!inv.projectId) continue;
    const total = quoteTotals(inv.items, inv.taxRate).total;
    facturadoByProjectId.set(inv.projectId, (facturadoByProjectId.get(inv.projectId) ?? 0) + total);
  }
  const currency = invoices[0]?.currency ?? "COP";

  // Filas: proyectos activos con estimado O real (> 0).
  const rows = activeProjects
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      emoji: p.emoji,
      estMin: estByProjectId.get(p.id) ?? 0,
      realMin: realByProjectId.get(p.id) ?? 0,
      facturado: facturadoByProjectId.get(p.id) ?? 0,
    }))
    .filter((r) => activeIds.has(r.projectId) && (r.estMin > 0 || r.realMin > 0))
    .sort((a, b) => b.realMin - a.realMin);

  return (
    <section>
      <h2 className="text-base font-semibold">Horas y rentabilidad por proyecto</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Estimado vs. real por proyecto activo{canFin ? " y su rentabilidad" : ""}
      </p>
      <ProfitabilityTable rows={rows} showMoney={canFin} currency={currency} />
    </section>
  );
}
