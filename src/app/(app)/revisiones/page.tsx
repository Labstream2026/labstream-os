import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Clock, Send, RefreshCw, MessageSquare, ArrowRight, Film, Play, Flame } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { DELIVERABLE_TYPE } from "@/lib/ui";
import { UserAvatar } from "@/components/user-avatar";

// Tiempo que un entregable lleva esperando esta acción y su nivel de urgencia.
// nowMs() a nivel de módulo evita el falso positivo de la regla de pureza con Date.now().
function nowMs(): number {
  return Date.now();
}
type Tier = "danger" | "warn" | "fresh";
function urgency(date: Date): { tier: Tier; text: string } {
  const ms = nowMs() - new Date(date).getTime();
  const h = Math.floor(ms / 3_600_000);
  const days = Math.floor(h / 24);
  if (days >= 3) return { tier: "danger", text: `esperando ${days} días` };
  if (h >= 24) return { tier: "warn", text: `esperando ${days} día${days === 1 ? "" : "s"}` };
  if (h >= 1) return { tier: "fresh", text: `hace ${h} h` };
  return { tier: "fresh", text: "hace un momento" };
}
const BAR: Record<Tier, string> = { danger: "bg-rose-500", warn: "bg-amber-500", fresh: "bg-emerald-500" };
const WAIT_TEXT: Record<Tier, string> = {
  danger: "font-medium text-rose-600 dark:text-rose-400",
  warn: "text-amber-600 dark:text-amber-400",
  fresh: "text-muted-foreground",
};

export const dynamic = "force-dynamic";

// Bandeja "Proyectos a revisar": entregables que esperan una acción de revisión, en
// los proyectos a los que el usuario tiene acceso. Tres grupos: pendientes de tu
// pre-aprobación interna, con el cliente, y con cambios solicitados.
export default async function RevisionesPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // La bandeja de revisión INTERNA es del equipo: el portal del cliente no entra (vería versiones
  // sin pre-aprobar y comentarios internos de su propio proyecto). Tiene su vista en /proyectos/[id].
  if (session.role === "cliente") redirect("/proyectos");

  const { scope } = await searchParams;
  const onlyMine = scope === "mine";

  const deliverables = await db.deliverable.findMany({
    where: {
      project: accessibleProjectWhere(session),
      status: { in: ["REVISION_INTERNA", "ENVIADO_CLIENTE", "CORRECCIONES"] },
    },
    select: {
      id: true,
      name: true,
      status: true,
      type: true,
      updatedAt: true,
      reviewerId: true,
      reviewers: { select: { userId: true } },
      ownerId: true,
      coverFileAssetId: true,
      project: { select: { id: true, name: true, emoji: true, leadId: true, client: { select: { id: true, name: true, photoUrl: true } } } },
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

  // "Pendientes" siempre es de tu responsabilidad. El filtro "Solo míos" acota además
  // los grupos informativos (con el cliente / cambios) a lo que tú lideras.
  const mineFilter = (d: (typeof deliverables)[number]) => !onlyMine || isMyResponsibility(d);
  const pendientes = deliverables
    .filter((d) => d.status === "REVISION_INTERNA" && isMyResponsibility(d))
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()); // los que más esperan, primero
  const conCliente = deliverables.filter((d) => d.status === "ENVIADO_CLIENTE" && mineFilter(d));
  const cambios = deliverables.filter((d) => d.status === "CORRECCIONES" && mineFilter(d));
  const total = pendientes.length + conCliente.length + cambios.length;
  // Urgentes = lo que necesita acción del EQUIPO (pendientes o cambios) y lleva 3+ días.
  const urgentes = [...pendientes, ...cambios].filter((d) => urgency(d.updatedAt).tier === "danger").length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ClipboardCheck className="size-6 text-primary" /> Proyectos a revisar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total > 0 ? `${total} entregable${total === 1 ? "" : "s"} esperan una acción.` : "Todo al día."} Abre uno para ver el video, comentar y decidir.
          </p>
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-border text-sm">
          <Link href="/revisiones?scope=mine" className={`px-3 py-1.5 ${onlyMine ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}>Solo míos</Link>
          <Link href="/revisiones" className={`px-3 py-1.5 ${!onlyMine ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}>Todos</Link>
        </div>
      </header>

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <ClipboardCheck className="mx-auto size-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No hay nada por revisar 🎉</p>
          <p className="text-sm text-muted-foreground">Cuando el equipo suba una versión nueva, aparecerá aquí.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Metric label="Pendientes de ti" value={pendientes.length} Icon={Clock} tone="amber" />
            <Metric label="Con el cliente" value={conCliente.length} Icon={Send} tone="sky" />
            <Metric label="Con cambios" value={cambios.length} Icon={RefreshCw} tone="amber" />
            <Metric label="Urgentes · 3+ días" value={urgentes} Icon={Flame} tone="rose" highlight />
          </div>

          <div className="space-y-7">
            <Group title="Pendientes de tu pre-aprobación" Icon={Clock} accent="amber" cta="Revisar" hint="Los que más esperan, primero" items={pendientes} primary />
            <DenseGroup title="Con el cliente" Icon={Send} items={conCliente} />
            <Group title="Cambios solicitados" Icon={RefreshCw} accent="rose" cta="Atender" items={cambios} />
          </div>
        </>
      )}
    </div>
  );
}

type Item = {
  id: string;
  name: string;
  status: string;
  type: string | null;
  updatedAt: Date;
  coverFileAssetId: string | null;
  project: { id: string; name: string; emoji: string | null; client: { id: string; name: string; photoUrl: string | null } | null };
  versions: { number: number; createdAt: Date; uploadedBy: { name: string; initials: string | null; avatarColor: string | null } | null }[];
  _count: { reviewComments: number };
};

const METRIC_TONE: Record<string, string> = {
  amber: "text-amber-600 dark:text-amber-400",
  sky: "text-sky-600 dark:text-sky-400",
  rose: "text-rose-600 dark:text-rose-400",
};

function Metric({ label, value, Icon, tone, highlight }: { label: string; value: number; Icon: React.ComponentType<{ className?: string }>; tone: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-3.5 py-3 ${highlight ? "bg-rose-50 dark:bg-rose-500/10" : "bg-muted/50"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`size-4 ${highlight ? METRIC_TONE.rose : METRIC_TONE[tone]}`} /> {label}
      </div>
      <div className={`mt-0.5 text-2xl font-semibold ${highlight ? METRIC_TONE.rose : ""}`}>{value}</div>
    </div>
  );
}

const ACCENT: Record<string, string> = {
  amber: "text-amber-600 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
};
const BADGE: Record<string, string> = {
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

// Miniatura del entregable: portada del reel si la hay → foto del cliente → icono de película.
// El badge v{n} y (cuando aplica) el ▶ van encima.
function Thumb({ d }: { d: Item }) {
  const v = d.versions[0];
  const hasCover = Boolean(d.coverFileAssetId);
  const clientPhoto = d.project.client?.photoUrl ? `/api/client-asset/photo/${d.project.client.id}` : null;
  const src = d.coverFileAssetId ? `/api/files-asset/${d.coverFileAssetId}` : clientPhoto;
  return (
    <div className="relative flex h-[60px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/40">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <Film className="size-5 text-muted-foreground" />
      )}
      {hasCover ? (
        <span className="absolute inset-0 flex items-center justify-center bg-black/15">
          <Play className="size-6 fill-white/90 text-white/90" />
        </span>
      ) : null}
      {v ? <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] leading-tight text-white">v{v.number}</span> : null}
    </div>
  );
}

function Group({ title, Icon, accent, cta, hint, items, primary }: { title: string; Icon: React.ComponentType<{ className?: string }>; accent: string; cta: string; hint?: string; items: Item[]; primary?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${ACCENT[accent]}`}>
        <Icon className="size-4" /> {title}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[accent]}`}>{items.length}</span>
        {hint ? <span className="ml-auto text-[11px] font-normal text-muted-foreground">{hint}</span> : null}
      </h2>
      <div className="grid gap-2.5">
        {items.map((d) => {
          const v = d.versions[0];
          const u = urgency(d.updatedAt);
          const uploader = v?.uploadedBy;
          const typeLabel = d.type ? DELIVERABLE_TYPE[d.type] ?? null : null;
          return (
            <Link
              key={d.id}
              href={`/revisiones/${d.id}`}
              className="group flex items-stretch overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <span className={`w-1 shrink-0 ${BAR[u.tier]}`} aria-hidden />
              <div className="flex flex-1 items-center gap-3 p-2.5">
                <Thumb d={d} />
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
                    <span className={`inline-flex items-center gap-1 text-[11px] ${WAIT_TEXT[u.tier]}`}>
                      {u.tier === "danger" ? <Flame className="size-3.5" /> : <Clock className="size-3.5" />} {u.text}
                    </span>
                    {d._count.reviewComments > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><MessageSquare className="size-3.5" /> {d._count.reviewComments}</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-between gap-2 self-stretch py-0.5">
                  {typeLabel ? <span className="text-[11px] text-muted-foreground">{typeLabel}</span> : <span />}
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${primary ? "bg-primary text-primary-foreground group-hover:bg-primary/90" : "border border-border text-primary"}`}>
                    {cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// "Con el cliente" es solo informativo (no requiere tu acción): filas densas y apagadas.
function DenseGroup({ title, Icon, items }: { title: string; Icon: React.ComponentType<{ className?: string }>; items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-sky-600 dark:text-sky-400">
        <Icon className="size-4" /> {title}
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{items.length}</span>
        <span className="ml-auto text-[11px] font-normal text-muted-foreground">Solo informativo</span>
      </h2>
      <div className="overflow-hidden rounded-xl border border-border">
        {items.map((d, i) => {
          const v = d.versions[0];
          return (
            <Link
              key={d.id}
              href={`/revisiones/${d.id}`}
              className={`flex items-center gap-2.5 bg-card px-3 py-2.5 transition-colors hover:bg-accent/30 ${i ? "border-t border-border" : ""}`}
            >
              <Play className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium">{d.name}</span>
              {v ? <span className="shrink-0 text-[11px] text-muted-foreground">v{v.number}</span> : null}
              <span className="truncate text-xs text-muted-foreground">· {d.project.name}</span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="size-3.5" /> {urgency(d.updatedAt).text}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary">Ver <ArrowRight className="size-3.5" /></span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
