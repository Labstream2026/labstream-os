import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Clock, Send, RefreshCw, MessageSquare, ArrowRight, Film, Play, Flame, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { UserAvatar } from "@/components/user-avatar";

// Tiempo que un entregable lleva esperando esta acción y su nivel de urgencia.
// nowMs() a nivel de módulo evita el falso positivo de la regla de pureza con Date.now().
function nowMs(): number {
  return Date.now();
}
type Tier = "danger" | "warn" | "fresh";
function urgency(date: Date): { tier: Tier; days: number; hours: number } {
  const ms = nowMs() - new Date(date).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  const tier: Tier = days >= 3 ? "danger" : hours >= 24 ? "warn" : "fresh";
  return { tier, days, hours };
}
// Etiqueta corta del chip de urgencia para lo que necesita acción del equipo.
function teamChip(u: { tier: Tier; days: number }): string {
  if (u.tier === "danger") return `${u.days} días`;
  if (u.tier === "warn") return `${u.days} día${u.days === 1 ? "" : "s"}`;
  return "nuevo";
}
// Etiqueta neutra "hace…" para lo que ya está con el cliente (no es urgencia nuestra).
function sinceLabel(u: { days: number; hours: number }): string {
  if (u.days >= 1) return `hace ${u.days} d`;
  if (u.hours >= 1) return `hace ${u.hours} h`;
  return "recién";
}
const CHIP: Record<Tier, string> = {
  danger: "bg-rose-500 text-white",
  warn: "bg-amber-400 text-amber-950",
  fresh: "bg-emerald-500 text-white",
};
// Duración en segundos → "m:ss" (o null si no se capturó).
function fmtDur(sec: number | null | undefined): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

export const dynamic = "force-dynamic";

// Bandeja "Proyectos a revisar": entregables que esperan una acción de revisión, en
// los proyectos a los que el usuario tiene acceso. Tres grupos: pendientes de tu
// pre-aprobación interna, con el cliente, y con cambios solicitados. Vista en galería.
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
      versions: { orderBy: { number: "desc" }, take: 1, select: { number: true, createdAt: true, durationSec: true, uploadedBy: { select: { name: true, initials: true, avatarColor: true } } } },
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

  const mineFilter = (d: (typeof deliverables)[number]) => !onlyMine || isMyResponsibility(d);
  const pendientes = deliverables
    .filter((d) => d.status === "REVISION_INTERNA" && isMyResponsibility(d))
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()); // los que más esperan, primero
  const conCliente = deliverables.filter((d) => d.status === "ENVIADO_CLIENTE" && mineFilter(d));
  const cambios = deliverables.filter((d) => d.status === "CORRECCIONES" && mineFilter(d));
  const total = pendientes.length + conCliente.length + cambios.length;
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

          <div className="space-y-8">
            <Group title="Pendientes de tu pre-aprobación" Icon={Clock} accent="amber" cta="Revisar" hint="Los más urgentes primero" items={pendientes} primary />
            <Group title="Con el cliente" Icon={Send} accent="sky" cta="Ver" hint="Solo informativo" items={conCliente} neutral />
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
  versions: { number: number; createdAt: Date; durationSec: number | null; uploadedBy: { name: string; initials: string | null; avatarColor: string | null } | null }[];
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
  sky: "text-sky-600 dark:text-sky-400",
  rose: "text-rose-600 dark:text-rose-400",
};
const BADGE: Record<string, string> = {
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function Group({ title, Icon, accent, cta, hint, items, primary, neutral }: { title: string; Icon: React.ComponentType<{ className?: string }>; accent: string; cta: string; hint?: string; items: Item[]; primary?: boolean; neutral?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className={`mb-3 flex items-center gap-2 text-sm font-semibold ${ACCENT[accent]}`}>
        <Icon className="size-4" /> {title}
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[accent]}`}>{items.length}</span>
        {hint ? <span className="ml-auto text-[11px] font-normal text-muted-foreground">{hint}</span> : null}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((d) => (
          <Card key={d.id} d={d} cta={cta} primary={primary} neutral={neutral} />
        ))}
      </div>
    </section>
  );
}

function Card({ d, cta, primary, neutral }: { d: Item; cta: string; primary?: boolean; neutral?: boolean }) {
  const v = d.versions[0];
  const u = urgency(d.updatedAt);
  const uploader = v?.uploadedBy;
  const dur = fmtDur(v?.durationSec);
  const clientPhoto = d.project.client?.photoUrl ? `/api/client-asset/photo/${d.project.client.id}` : null;
  const src = d.coverFileAssetId ? `/api/files-asset/${d.coverFileAssetId}` : clientPhoto;
  const UrgencyIcon = u.tier === "danger" ? Flame : u.tier === "warn" ? Clock : Sparkles;
  return (
    <Link
      href={`/revisiones/${d.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className="size-6 text-muted-foreground" />
          </div>
        )}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex size-10 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg">
            <Play className="size-5 translate-x-0.5 fill-current" />
          </span>
        </span>
        {/* Chip de urgencia (equipo) o de tiempo con el cliente (neutro). */}
        {neutral ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
            <Clock className="size-3" /> {sinceLabel(u)}
          </span>
        ) : (
          <span className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${CHIP[u.tier]}`}>
            <UrgencyIcon className="size-3" /> {teamChip(u)}
          </span>
        )}
        {d._count.reviewComments > 0 ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
            <MessageSquare className="size-3" /> {d._count.reviewComments}
          </span>
        ) : null}
        {dur ? <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{dur}</span> : null}
        {v ? <span className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">v{v.number}</span> : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{d.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="opacity-80">{d.project.emoji ?? "🎬"}</span> {d.project.name}{d.project.client ? ` · ${d.project.client.name}` : ""}
          </p>
        </div>
        <div className="mt-auto flex items-center gap-2">
          {uploader ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
              <UserAvatar initials={uploader.initials} color={uploader.avatarColor} size="sm" />
              <span className="truncate">{uploader.name.split(" ")[0]}</span>
            </span>
          ) : <span />}
          <span className={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${primary ? "bg-primary text-primary-foreground group-hover:bg-primary/90" : "border border-border text-primary"}`}>
            {cta} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
