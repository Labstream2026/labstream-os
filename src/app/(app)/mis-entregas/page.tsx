import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock, CheckCircle2, Inbox } from "lucide-react";
import { IconEntregas } from "@/components/icons";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

// Estados de un entregable que YA son visibles para el cliente (se le envió). Los estados
// internos (PENDIENTE, EN_PRODUCCION, EN_EDICION, REVISION_INTERNA) no entran a su sala.
const CLIENT_STATES = ["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"] as const;
const APPROVED_STATES = ["APROBADO", "ENTREGADO"];

// Resumen de estado de una CAMPAÑA (proyecto) a partir de sus piezas visibles para el cliente.
function campaignSummary(states: string[]) {
  const total = states.length;
  const approved = states.filter((s) => APPROVED_STATES.includes(s)).length;
  const cambios = states.filter((s) => s === "CORRECCIONES").length;
  const pendiente = states.filter((s) => s === "ENVIADO_CLIENTE").length;
  const pct = total ? Math.round((approved / total) * 100) : 0;
  const pill =
    total > 0 && approved === total
      ? { label: "Aprobado", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" }
      : cambios > 0
        ? { label: "Cambios solicitados", className: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" }
        : { label: "En revisión", className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300" };
  return { total, approved, cambios, pendiente, pct, pill };
}

// Dashboard del cliente: "sala privada" con una tarjeta por campaña (proyecto) y su avance.
// Reúne los proyectos que el usuario puede ver (accessibleProjectWhere) que ya tengan al menos
// una pieza enviada al cliente. Cada tarjeta abre la campaña con sus bloques de entregas.
export default async function MisEntregasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // El cliente invitado SOLO ve las piezas donde el equipo lo "tagueó" como revisor
  // (DeliverableReviewer, o el reviewer primario). Así no ve entregables de la campaña que no le
  // corresponden. El equipo interno (si abriera esta vista) ve todas las de cara al cliente.
  const mine =
    session.role === "cliente"
      ? { OR: [{ reviewers: { some: { userId: session.id } } }, { reviewerId: session.id }] }
      : {};
  const deliverableFilter = { status: { in: [...CLIENT_STATES] }, ...mine };

  const projects = await db.project.findMany({
    where: {
      AND: [accessibleProjectWhere(session), { deliverables: { some: deliverableFilter } }],
    },
    select: {
      id: true,
      name: true,
      emoji: true,
      color: true,
      updatedAt: true,
      client: { select: { name: true } },
      deliverables: {
        where: deliverableFilter,
        select: { status: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const campaigns = projects.map((p) => ({
    id: p.id,
    name: p.name,
    emoji: p.emoji,
    color: p.color,
    clientName: p.client?.name ?? null,
    ...campaignSummary(p.deliverables.map((d) => d.status)),
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Inbox className="size-6 text-primary" /> Tus entregas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aquí están tus campañas. Abre una para revisar cada pieza, comentar y aprobar o pedir cambios.
        </p>
      </header>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<IconEntregas />}
          title="Aún no hay entregas para revisar"
          description="En cuanto tu equipo te envíe una pieza, la verás aquí."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/mis-entregas/${c.id}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
            >
              <div
                className="flex h-16 items-center justify-center border-b border-border/60"
                style={{ background: c.color ? `${c.color}22` : undefined }}
              >
                <span className="text-3xl">{c.emoji ?? "🎬"}</span>
              </div>
              <div className="flex flex-1 flex-col gap-2.5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.name}</p>
                    {c.clientName ? <p className="truncate text-xs text-muted-foreground">{c.clientName}</p> : null}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${c.pill.className}`}>{c.pill.label}</span>
                </div>

                <p className="text-xs text-muted-foreground">
                  {c.total} {c.total === 1 ? "pieza" : "piezas"}
                  {c.approved > 0 ? ` · ${c.approved} aprobada${c.approved === 1 ? "" : "s"}` : ""}
                  {c.cambios > 0 ? ` · ${c.cambios} con cambios` : ""}
                  {c.pendiente > 0 ? ` · ${c.pendiente} pendiente${c.pendiente === 1 ? "" : "s"}` : ""}
                </p>

                <div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${c.pct}%` }} />
                  </div>
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    {c.approved === c.total ? <CheckCircle2 className="size-3.5 text-emerald-500" /> : <Clock className="size-3.5" />}
                    {c.approved} de {c.total} aprobadas
                  </p>
                </div>

                <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium text-primary">
                  Revisar entregas <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
