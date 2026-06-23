import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Clock, Send, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { deliverableStatusMeta, formatShortDate } from "@/lib/ui";

export const dynamic = "force-dynamic";

// Bandeja "Proyectos a revisar": entregables que esperan una acción de revisión, en
// los proyectos a los que el usuario tiene acceso. Tres grupos: pendientes de tu
// pre-aprobación interna, con el cliente, y con cambios solicitados.
export default async function RevisionesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const deliverables = await db.deliverable.findMany({
    where: {
      project: accessibleProjectWhere(session),
      status: { in: ["REVISION_INTERNA", "ENVIADO_CLIENTE", "CORRECCIONES"] },
    },
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
      reviewerId: true,
      ownerId: true,
      project: { select: { id: true, name: true, emoji: true, leadId: true, client: { select: { name: true } } } },
      versions: { orderBy: { number: "desc" }, take: 1, select: { number: true, createdAt: true, uploadedBy: { select: { name: true } } } },
      _count: { select: { reviewComments: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Responsable de la pre-aprobación: el reviewer asignado; si no hay, el lead del proyecto
  // (y en último caso, el dueño del entregable). Solo a esa persona le sale "pendiente".
  const responsibleId = (d: (typeof deliverables)[number]) => d.reviewerId ?? d.project.leadId ?? d.ownerId;
  const pendientes = deliverables.filter((d) => d.status === "REVISION_INTERNA" && responsibleId(d) === session.id);
  const conCliente = deliverables.filter((d) => d.status === "ENVIADO_CLIENTE");
  const cambios = deliverables.filter((d) => d.status === "CORRECCIONES");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ClipboardCheck className="size-6 text-primary" /> Proyectos a revisar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Entregables que esperan tu revisión. Abre uno para ver el video, comentar y pre-aprobar o solicitar cambios.
        </p>
      </header>

      {deliverables.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <ClipboardCheck className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No hay nada por revisar 🎉</p>
          <p className="text-sm text-muted-foreground">Cuando el equipo suba una versión nueva, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <Group title="Pendientes de tu pre-aprobación" Icon={Clock} accent="amber" items={pendientes} />
          <Group title="Con el cliente" Icon={Send} accent="sky" items={conCliente} />
          <Group title="Cambios solicitados" Icon={RefreshCw} accent="rose" items={cambios} />
        </div>
      )}
    </div>
  );
}

type Item = {
  id: string;
  name: string;
  status: string;
  updatedAt: Date;
  project: { id: string; name: string; emoji: string | null; client: { name: string } | null };
  versions: { number: number; createdAt: Date; uploadedBy: { name: string } | null }[];
  _count: { reviewComments: number };
};

const ACCENT: Record<string, string> = {
  amber: "text-amber-600 dark:text-amber-400",
  sky: "text-sky-600 dark:text-sky-400",
  rose: "text-rose-600 dark:text-rose-400",
};

function Group({ title, Icon, accent, items }: { title: string; Icon: React.ComponentType<{ className?: string }>; accent: string; items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className={`mb-2 flex items-center gap-2 text-sm font-semibold ${ACCENT[accent]}`}>
        <Icon className="size-4" /> {title} <span className="text-muted-foreground">({items.length})</span>
      </h2>
      <div className="grid gap-2">
        {items.map((d) => {
          const meta = deliverableStatusMeta(d.status);
          const v = d.versions[0];
          return (
            <Link
              key={d.id}
              href={`/revisiones/${d.id}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <span className="text-lg leading-none">{d.project.emoji ?? "🎬"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {d.project.name}
                  {d.project.client ? ` · ${d.project.client.name}` : ""}
                  {v ? ` · v${v.number}${v.uploadedBy ? ` de ${v.uploadedBy.name}` : ""} · ${formatShortDate(v.createdAt)}` : ""}
                </p>
              </div>
              {d._count.reviewComments > 0 ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{d._count.reviewComments} 💬</span>
              ) : null}
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
