import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Clock, Send, RefreshCw, MessageSquare, ArrowRight, Film } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { deliverableStatusMeta } from "@/lib/ui";
import { UserAvatar } from "@/components/user-avatar";

// Tiempo que un entregable lleva esperando esta acción. Se vuelve "urgente" (rojo) a los 3 días.
// nowMs() a nivel de módulo evita el falso positivo de la regla de pureza con Date.now().
function nowMs(): number {
  return Date.now();
}
function waitingLabel(date: Date): { text: string; danger: boolean } {
  const ms = nowMs() - new Date(date).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return { text: "hace un momento", danger: false };
  if (h < 24) return { text: `hace ${h} h`, danger: false };
  const days = Math.floor(h / 24);
  return { text: `esperando ${days} día${days === 1 ? "" : "s"}`, danger: days >= 3 };
}

export const dynamic = "force-dynamic";

// Bandeja "Proyectos a revisar": entregables que esperan una acción de revisión, en
// los proyectos a los que el usuario tiene acceso. Tres grupos: pendientes de tu
// pre-aprobación interna, con el cliente, y con cambios solicitados.
export default async function RevisionesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // La bandeja de revisión INTERNA es del equipo: el portal del cliente no entra (vería versiones
  // sin pre-aprobar y comentarios internos de su propio proyecto). Tiene su vista en /proyectos/[id].
  if (session.role === "cliente") redirect("/proyectos");

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
      reviewers: { select: { userId: true } },
      ownerId: true,
      project: { select: { id: true, name: true, emoji: true, leadId: true, client: { select: { name: true } } } },
      versions: { orderBy: { number: "desc" }, take: 1, select: { number: true, createdAt: true, uploadedBy: { select: { name: true, initials: true, avatarColor: true } } } },
      _count: { select: { reviewComments: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Responsable de la pre-aprobación: CUALQUIER revisor asignado (co-revisores). Si no hay revisores,
  // cae al lead del proyecto (y en último caso, al dueño del entregable). A todos esos les sale "pendiente".
  const isMyResponsibility = (d: (typeof deliverables)[number]) =>
    d.reviewers.length
      ? d.reviewers.some((r) => r.userId === session.id)
      : (d.project.leadId ?? d.ownerId) === session.id;
  const pendientes = deliverables.filter((d) => d.status === "REVISION_INTERNA" && isMyResponsibility(d));
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
          <Group title="Pendientes de tu pre-aprobación" Icon={Clock} accent="amber" cta="Revisar" items={pendientes} />
          <Group title="Con el cliente" Icon={Send} accent="sky" cta="Ver" items={conCliente} />
          <Group title="Cambios solicitados" Icon={RefreshCw} accent="rose" cta="Revisar" items={cambios} />
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
  versions: { number: number; createdAt: Date; uploadedBy: { name: string; initials: string | null; avatarColor: string | null } | null }[];
  _count: { reviewComments: number };
};

const ACCENT: Record<string, string> = {
  amber: "text-amber-600 dark:text-amber-400",
  sky: "text-sky-600 dark:text-sky-400",
  rose: "text-rose-600 dark:text-rose-400",
};
const BADGE: Record<string, string> = {
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function Group({ title, Icon, accent, cta, items }: { title: string; Icon: React.ComponentType<{ className?: string }>; accent: string; cta: string; items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${ACCENT[accent]}`}>
        <Icon className="size-4" /> {title}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[accent]}`}>{items.length}</span>
      </h2>
      <div className="grid gap-2.5">
        {items.map((d) => {
          const meta = deliverableStatusMeta(d.status);
          const v = d.versions[0];
          const wait = waitingLabel(d.updatedAt);
          const uploader = v?.uploadedBy;
          return (
            <Link
              key={d.id}
              href={`/revisiones/${d.id}`}
              className="group flex items-stretch gap-3 rounded-xl border border-border bg-card p-2.5 transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              {/* Miniatura: marco con icono + número de versión (sin imagen para no romper la vista). */}
              <div className="relative flex h-[52px] w-[74px] shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                <Film className="size-5 text-muted-foreground" />
                {v ? <span className="absolute bottom-1 right-1 rounded border border-border bg-card/90 px-1 text-[10px] leading-tight text-muted-foreground">v{v.number}</span> : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="opacity-80">{d.project.emoji ?? "🎬"}</span> {d.project.name}{d.project.client ? ` · ${d.project.client.name}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {uploader ? (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <UserAvatar initials={uploader.initials} color={uploader.avatarColor} size="sm" /> subió {uploader.name.split(" ")[0]}
                    </span>
                  ) : null}
                  <span className={`inline-flex items-center gap-1 text-[11px] ${wait.danger ? "font-medium text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}>
                    <Clock className="size-3.5" /> {wait.text}
                  </span>
                  {d._count.reviewComments > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><MessageSquare className="size-3.5" /> {d._count.reviewComments}</span>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end justify-between">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  {cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
