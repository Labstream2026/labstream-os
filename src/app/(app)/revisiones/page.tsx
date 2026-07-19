import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Send, RefreshCw, MessageSquare, ArrowRight, Film, Play, Flame, Sparkles, Inbox, Archive, Users, Calendar, CheckCircle2, Rocket, Eye } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleProjectWhere, canManageProject } from "@/lib/project-access";
import { UserAvatar } from "@/components/user-avatar";
import { deliverableStatusMeta } from "@/lib/ui";
import { TONE_MAP } from "@/lib/colors";
import { signReviewToken } from "@/lib/review-token";
import { DeliverableAdminActions } from "./deliverable-admin-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { IconRevisiones } from "@/components/icons";
import { EntityEmoji } from "@/components/icons/marks";

const REVIEW_BASE = process.env.NEXTAUTH_URL || "";

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
// Etiqueta neutra "hace…" para lo que ya está con el cliente / entregado (no es urgencia nuestra).
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
// Estados "pasivos" (no es una acción pendiente NUESTRA): con el cliente o ya finalizados.
function isNeutralStatus(status: string): boolean {
  return status === "ENVIADO_CLIENTE" || status === "APROBADO" || status === "ENTREGADO";
}
// Color del cliente → hex para la barra/tinte/punto. `accentColor` guarda un TOKEN de la paleta
// (indigo, teal…): se resuelve al MISMO hex que usa el resto de la app (tone().hex). Se contempla un
// hex directo por compatibilidad; un token desconocido → null (sin color, para no caer en un color
// CSS nombrado inesperado).
function clientHex(accent: string | null | undefined): string | null {
  if (!accent) return null;
  if (accent.startsWith("#")) return accent;
  return TONE_MAP[accent]?.hex ?? null;
}

export const dynamic = "force-dynamic";

type GroupMode = "estado" | "cliente" | "fecha";
type TabKey = "por-aprobar" | "aprobados" | "publicados" | "archivados";

// Bandeja de GESTIÓN de entregables (equipo). "Activos": los que esperan una acción de revisión
// (pre-aprobación / con el cliente / cambios). "Archivados": los ya entregados o parqueados a mano
// — SALEN del inbox pero su enlace de entrega sigue vivo hasta que se borre. Cada ficha se pinta con
// el color de su cliente (barra + tinte) y se puede agrupar por Estado (por defecto), Cliente o Fecha.
export default async function RevisionesPage({ searchParams }: { searchParams: Promise<{ scope?: string; tab?: string; group?: string; uploader?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  // La bandeja de revisión INTERNA es del equipo: el portal del cliente no entra (vería versiones
  // sin pre-aprobar y comentarios internos de su propio proyecto). Tiene su vista en /proyectos/[id].
  if (session.role === "cliente") redirect("/proyectos");

  const { scope, tab, group, uploader } = await searchParams;
  const onlyMine = scope === "mine";
  const activeTab: TabKey = tab === "aprobados" ? "aprobados" : tab === "publicados" ? "publicados" : tab === "archivados" ? "archivados" : "por-aprobar";
  const groupMode: GroupMode = group === "cliente" ? "cliente" : group === "fecha" ? "fecha" : "estado";
  const uploaderId = uploader || null;
  // ¿Puede el usuario marcar entregables como publicados? Es a nivel de sesión (mismo permiso que la
  // pre-aprobación interna); el gate por proyecto se combina con canManage más abajo, por ítem.
  const sessionCanApprove = hasPermission(session, "aprobar_entregables");

  // Los proyectos TERMINADOS no aparecen en Revisiones (están en su archivo, no en el flujo activo).
  const acc = { ...accessibleProjectWhere(session), finishedAt: null };
  // Cuatro bandejas DISJUNTAS. La clave: "aprobado por el cliente" (APROBADO/ENTREGADO) y "publicado"
  // son cosas distintas → van en pestañas distintas. Un publicado siempre está aprobado, así que
  // publishedAt no-nulo lo saca de «Aprobados». Archivar (parquear) gana sobre todo: si algo se
  // archiva, va a «Archivados» aunque estuviera aprobado o publicado.
  //  · Por aprobar: en revisión, sin archivar, sin publicar.
  //  · Aprobados:   aprobado/entregado por el cliente, sin publicar y sin archivar.
  //  · Publicados:  con sello de publicación (publishedAt), sin archivar.
  //  · Archivados:  parqueados a mano; su enlace de entrega sigue vivo hasta borrarlo.
  const porAprobarWhere: Prisma.DeliverableWhereInput = { project: acc, archivedAt: null, publishedAt: null, status: { in: ["REVISION_INTERNA", "ENVIADO_CLIENTE", "CORRECCIONES"] } };
  const aprobadosWhere: Prisma.DeliverableWhereInput = { project: acc, archivedAt: null, publishedAt: null, status: { in: ["APROBADO", "ENTREGADO"] } };
  const publicadosWhere: Prisma.DeliverableWhereInput = { project: acc, archivedAt: null, publishedAt: { not: null } };
  const archivadosWhere: Prisma.DeliverableWhereInput = { project: acc, archivedAt: { not: null } };
  const whereByTab: Record<TabKey, Prisma.DeliverableWhereInput> = { "por-aprobar": porAprobarWhere, aprobados: aprobadosWhere, publicados: publicadosWhere, archivados: archivadosWhere };

  const [rows, porAprobarCount, aprobadosCount, publicadosCount, archivadosCount] = await Promise.all([
    db.deliverable.findMany({
      where: whereByTab[activeTab],
      select: {
        id: true,
        name: true,
        number: true,
        status: true,
        type: true,
        updatedAt: true,
        reviewerId: true,
        reviewers: { select: { userId: true } },
        ownerId: true,
        coverFileAssetId: true,
        // reviewRevokedAt/reviewExpiresAt → saber si el enlace de entrega sigue activo. archivedAt → tab.
        reviewRevokedAt: true,
        reviewExpiresAt: true,
        archivedAt: true,
        // Visitas del cliente al enlace: 0 = pre-aprobado pero aún sin abrir; >0 = ya lo está viendo.
        reviewVisits: true,
        // Sello de publicación (interno): fecha + quién lo marcó, para la pestaña «Publicados».
        publishedAt: true,
        publishedBy: { select: { name: true } },
        // El proyecto trae lo necesario para pintar (cliente + color) Y para resolver canManage
        // (isPrivate/leadId/members y, para la rama de editor, los miembros del cliente).
        project: {
          select: {
            id: true,
            name: true,
            emoji: true,
            isPrivate: true,
            leadId: true,
            members: { select: { userId: true, role: true } },
            client: { select: { id: true, name: true, photoUrl: true, accentColor: true, members: { select: { userId: true, role: true } } } },
          },
        },
        versions: { orderBy: { number: "desc" }, take: 1, select: { number: true, createdAt: true, durationSec: true, uploadedBy: { select: { id: true, name: true, initials: true, avatarColor: true } } } },
        _count: { select: { reviewComments: true } },
      },
      orderBy: activeTab === "publicados" ? { publishedAt: "desc" } : { updatedAt: "desc" },
    }),
    db.deliverable.count({ where: porAprobarWhere }),
    db.deliverable.count({ where: aprobadosWhere }),
    db.deliverable.count({ where: publicadosWhere }),
    db.deliverable.count({ where: archivadosWhere }),
  ]);

  // Responsable de la pre-aprobación: CUALQUIER revisor asignado (co-revisores). Si no hay revisores,
  // cae al lead del proyecto (y en último caso, al dueño del entregable). A todos esos les sale "pendiente".
  const isMyResponsibility = (d: (typeof rows)[number]) =>
    d.reviewers.length
      ? d.reviewers.some((r) => r.userId === session.id)
      : (d.project.leadId ?? d.ownerId) === session.id;

  const now = nowMs();
  // Vista-modelo enriquecida: se resuelve una sola vez si el usuario puede gestionar el entregable
  // (canManage → botones de archivar/borrar), el enlace de entrega y su estado (vivo/archivado).
  const items: Item[] = rows.map((d) => ({
    id: d.id,
    name: d.name,
    number: d.number,
    status: d.status,
    type: d.type,
    updatedAt: d.updatedAt,
    coverFileAssetId: d.coverFileAssetId,
    project: { id: d.project.id, name: d.project.name, emoji: d.project.emoji, client: d.project.client ? { id: d.project.client.id, name: d.project.client.name, photoUrl: d.project.client.photoUrl, accentColor: d.project.client.accentColor } : null },
    versions: d.versions,
    _count: d._count,
    mine: isMyResponsibility(d),
    manage: canManageProject(d.project, session),
    // Publicar exige gestionar el proyecto Y el permiso de aprobar (mismo gate que setDeliverablePublished).
    canPublish: canManageProject(d.project, session) && sessionCanApprove,
    publishedAt: d.publishedAt,
    publishedByName: d.publishedBy?.name ?? null,
    reviewVisits: d.reviewVisits,
    reviewUrl: `${REVIEW_BASE}/review/${signReviewToken(d.id)}`,
    linkActive: !d.reviewRevokedAt && (!d.reviewExpiresAt || d.reviewExpiresAt.getTime() > now),
    archived: d.archivedAt != null,
  }));

  const mineFilter = (d: Item) => !onlyMine || d.mine;
  const scoped = items.filter(mineFilter);

  // Filtro "Subido por": personas que subieron la ÚLTIMA versión de algún entregable del alcance
  // actual (las opciones se calculan ANTES de aplicar el filtro, para poder cambiar de persona).
  const uploaderMap = new Map<string, { id: string; name: string; initials: string | null; avatarColor: string | null }>();
  for (const d of scoped) {
    const u = d.versions[0]?.uploadedBy;
    if (u) uploaderMap.set(u.id, u);
  }
  const uploaders = [...uploaderMap.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  const visible = uploaderId ? scoped.filter((d) => d.versions[0]?.uploadedBy?.id === uploaderId) : scoped;

  // Vista "Activos + agrupar por Estado" = la de siempre (tres grupos con su lógica y métricas).
  const pendientes = visible
    .filter((d) => d.status === "REVISION_INTERNA" && d.mine)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()); // los que más esperan, primero
  // REVISION_INTERNA que NO es responsabilidad de quien mira (típico de admin/gerente, que ve todos
  // los proyectos, o de un miembro cuyo compañero es el revisor asignado): antes no caía en ningún
  // grupo de la vista por Estado, así que el tablero pintaba MENOS tarjetas que el número de la
  // pestaña y del encabezado. Se listan como grupo neutro (no es una acción MÍA) para que cuadre.
  const pendientesOtros = visible
    .filter((d) => d.status === "REVISION_INTERNA" && !d.mine)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
  // Etapa "con el cliente" (ENVIADO_CLIENTE = ya pre-aprobado internamente) partida en dos según si
  // el cliente ABRIÓ el enlace (reviewVisits): así se distingue lo que solo está pre-aprobado y en
  // espera, de lo que el cliente ya está revisando (y de quien se espera una decisión).
  const enviadosCliente = visible.filter((d) => d.status === "ENVIADO_CLIENTE");
  const preAprobados = enviadosCliente.filter((d) => d.reviewVisits === 0);
  const conCliente = enviadosCliente.filter((d) => d.reviewVisits > 0);
  const cambios = visible.filter((d) => d.status === "CORRECCIONES");

  // Enlaces de la barra de control, conservando el resto de parámetros.
  const hrefFor = (over: { tab?: TabKey; group?: GroupMode; scope?: "mine" | "all"; uploader?: string | null }) => {
    const t = over.tab ?? activeTab;
    const g = over.group ?? groupMode;
    const s = over.scope ?? (onlyMine ? "mine" : "all");
    const u = over.uploader === undefined ? uploaderId : over.uploader; // null explícito = quitar filtro
    const p = new URLSearchParams();
    if (t !== "por-aprobar") p.set("tab", t); // «Por aprobar» es la pestaña por defecto (sin parámetro)
    if (g !== "estado") p.set("group", g);
    if (s === "mine") p.set("scope", "mine");
    if (u) p.set("uploader", u);
    const qs = p.toString();
    return qs ? `/revisiones?${qs}` : "/revisiones";
  };

  const total = visible.length;
  const TAB_META: Record<TabKey, { title: string; desc: string }> = {
    "por-aprobar": {
      title: "Proyectos a revisar",
      desc: total > 0 ? `${total} entregable${total === 1 ? "" : "s"} esperan una acción. Abre uno para ver el video, comentar y decidir.` : "Todo al día.",
    },
    aprobados: { title: "Aprobados por el cliente", desc: "Ya aprobados y aún sin publicar. Cuando salgan al aire, márcalos como publicados." },
    publicados: { title: "Publicados", desc: "Piezas que ya salieron al aire, con la fecha en que se publicaron." },
    archivados: { title: "Entregables archivados", desc: "Parqueados a mano. Su enlace de entrega sigue funcionando hasta que lo borres." },
  };
  const tabMeta = TAB_META[activeTab];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <PageHeader
          icon={<IconRevisiones />}
          title={tabMeta.title}
          description={tabMeta.desc}
          actions={
            <div className="inline-flex overflow-hidden rounded-lg border border-border text-sm">
              <Link href={hrefFor({ scope: "mine" })} className={`px-3 py-1.5 ${onlyMine ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}>Solo míos</Link>
              <Link href={hrefFor({ scope: "all" })} className={`px-3 py-1.5 ${!onlyMine ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}>Todos</Link>
            </div>
          }
        />

        {/* Pestañas (Por aprobar / Aprobados / Publicados / Archivados) + agrupación. */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-border text-sm">
            {([
              { key: "por-aprobar", label: "Por aprobar", Icon: Inbox, count: porAprobarCount },
              { key: "aprobados", label: "Aprobados", Icon: CheckCircle2, count: aprobadosCount },
              { key: "publicados", label: "Publicados", Icon: Rocket, count: publicadosCount },
              { key: "archivados", label: "Archivados", Icon: Archive, count: archivadosCount },
            ] as const).map((t, i) => (
              <Link
                key={t.key}
                href={hrefFor({ tab: t.key })}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${i > 0 ? "border-l border-border" : ""} ${activeTab === t.key ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
              >
                <t.Icon className="size-4" /> {t.label} <span className="text-xs text-muted-foreground">{t.count}</span>
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Agrupar por</span>
            <div className="inline-flex overflow-hidden rounded-lg border border-border text-sm">
              <Link href={hrefFor({ group: "estado" })} className={`px-2.5 py-1.5 text-xs ${groupMode === "estado" ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}>Estado</Link>
              <Link href={hrefFor({ group: "cliente" })} className={`inline-flex items-center gap-1 border-l border-border px-2.5 py-1.5 text-xs ${groupMode === "cliente" ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}><Users className="size-3.5" /> Cliente</Link>
              <Link href={hrefFor({ group: "fecha" })} className={`inline-flex items-center gap-1 border-l border-border px-2.5 py-1.5 text-xs ${groupMode === "fecha" ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}><Calendar className="size-3.5" /> Fecha</Link>
            </div>
          </div>
        </div>

        {/* Filtro "Subido por": quien subió la ÚLTIMA versión de cada entregable. */}
        {uploaders.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Subido por</span>
            <div className="inline-flex flex-wrap overflow-hidden rounded-lg border border-border text-sm">
              <Link href={hrefFor({ uploader: null })} className={`px-2.5 py-1.5 text-xs ${!uploaderId ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}>Todos</Link>
              {uploaders.map((u) => (
                <Link
                  key={u.id}
                  href={hrefFor({ uploader: u.id })}
                  className={`inline-flex items-center gap-1.5 border-l border-border px-2.5 py-1.5 text-xs ${uploaderId === u.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
                >
                  <UserAvatar initials={u.initials} color={u.avatarColor} size="sm" className="h-5 w-5" />
                  {u.name.split(" ")[0]}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </header>

      {visible.length === 0 ? (
        <EmptyState
          icon={<IconRevisiones />}
          title={
            activeTab === "archivados" ? "No hay entregables archivados"
              : activeTab === "aprobados" ? "Nada aprobado todavía"
                : activeTab === "publicados" ? "Nada publicado todavía"
                  : "No hay nada por revisar"
          }
          description={
            activeTab === "archivados" ? "Los que archives aparecerán aquí, con su enlace vivo."
              : activeTab === "aprobados" ? "Cuando el cliente apruebe una pieza, aparecerá aquí lista para publicar."
                : activeTab === "publicados" ? "Marca un aprobado como publicado y aparecerá aquí."
                  : "Cuando el equipo suba una versión nueva, aparecerá aquí."
          }
        />
      ) : activeTab === "por-aprobar" && groupMode === "estado" ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Metric label="Pendientes de ti" value={pendientes.length} Icon={Clock} tone="amber" />
            <Metric label="Pre-aprobados" value={preAprobados.length} Icon={Send} tone="sky" />
            <Metric label="Con el cliente" value={conCliente.length} Icon={Eye} tone="teal" />
            <Metric label="Con cambios" value={cambios.length} Icon={RefreshCw} tone="rose" />
          </div>
          <div className="space-y-8">
            <Group title="Pendientes de tu pre-aprobación" Icon={Clock} accent="amber" cta="Revisar" hint="Los más urgentes primero" items={pendientes} primary />
            <Group title="En pre-aprobación de otros" Icon={Clock} accent="sky" cta="Ver" hint="Las revisa otro compañero" items={pendientesOtros} neutral />
            <Group title="Pre-aprobados · esperando al cliente" Icon={Send} accent="sky" cta="Ver" hint="El cliente aún no lo ha abierto" items={preAprobados} neutral />
            <Group title="Con el cliente · ya lo está viendo" Icon={Eye} accent="teal" cta="Ver" hint="El cliente ya lo abrió" items={conCliente} neutral />
            <Group title="Cambios solicitados" Icon={RefreshCw} accent="rose" cta="Atender" items={cambios} />
          </div>
        </>
      ) : (
        <GenericGroups items={visible} mode={groupMode} cta={activeTab === "archivados" ? "Abrir" : activeTab === "por-aprobar" ? "Revisar" : "Ver"} />
      )}
    </div>
  );
}

type Item = {
  id: string;
  name: string;
  number: number | null;
  status: string;
  type: string | null;
  updatedAt: Date;
  coverFileAssetId: string | null;
  project: { id: string; name: string; emoji: string | null; client: { id: string; name: string; photoUrl: string | null; accentColor: string | null } | null };
  versions: { number: number; createdAt: Date; durationSec: number | null; uploadedBy: { id: string; name: string; initials: string | null; avatarColor: string | null } | null }[];
  _count: { reviewComments: number };
  mine: boolean;
  manage: boolean;
  canPublish: boolean;
  publishedAt: Date | null;
  publishedByName: string | null;
  reviewVisits: number;
  reviewUrl: string;
  linkActive: boolean;
  archived: boolean;
};

const METRIC_TONE: Record<string, string> = {
  amber: "text-amber-600 dark:text-amber-400",
  sky: "text-sky-600 dark:text-sky-400",
  teal: "text-teal-600 dark:text-teal-400",
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
  teal: "text-teal-600 dark:text-teal-400",
  rose: "text-rose-600 dark:text-rose-400",
};
const BADGE: Record<string, string> = {
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
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

// Agrupación genérica (Cliente / Fecha / Estado en la pestaña de archivados): cabecera con punto de
// color (cliente) + grilla de tarjetas. Cada tarjeta muestra su estado (chip) porque la cabecera ya
// no lo indica.
function GenericGroups({ items, mode, cta }: { items: Item[]; mode: GroupMode; cta: string }) {
  const groups = mode === "cliente" ? groupByClient(items) : mode === "fecha" ? groupByDate(items) : groupByStatus(items);
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.key}>
          <div className="mb-3 flex items-center gap-2">
            {g.color ? <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: g.color }} /> : null}
            <h2 className="text-sm font-semibold">{g.label}</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{g.items.length}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {g.items.map((d) => (
              <Card key={d.id} d={d} cta={cta} neutral={isNeutralStatus(d.status)} showStatus />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type Bucket = { key: string; label: string; color: string | null; items: Item[] };

function groupByClient(items: Item[]): Bucket[] {
  const map = new Map<string, Item[]>();
  for (const d of items) {
    const k = d.project.client?.id ?? "__none__";
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(d);
  }
  return [...map.entries()]
    .map(([key, its]) => ({ key, label: its[0].project.client?.name ?? "Sin cliente", color: clientHex(its[0].project.client?.accentColor), items: its }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function groupByStatus(items: Item[]): Bucket[] {
  const order = ["REVISION_INTERNA", "CORRECCIONES", "ENVIADO_CLIENTE", "APROBADO", "ENTREGADO"];
  const map = new Map<string, Item[]>();
  for (const d of items) {
    if (!map.has(d.status)) map.set(d.status, []);
    map.get(d.status)!.push(d);
  }
  return [...map.keys()]
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map((k) => ({ key: k, label: deliverableStatusMeta(k).label, color: null, items: map.get(k)! }));
}

function groupByDate(items: Item[]): Bucket[] {
  const now = nowMs();
  const defs: { key: string; label: string; maxH: number }[] = [
    { key: "hoy", label: "Hoy", maxH: 24 },
    { key: "semana", label: "Esta semana", maxH: 24 * 7 },
    { key: "mes", label: "Este mes", maxH: 24 * 31 },
    { key: "old", label: "Anteriores", maxH: Infinity },
  ];
  const groups: Bucket[] = defs.map((d) => ({ key: d.key, label: d.label, color: null, items: [] }));
  for (const d of items) {
    const h = (now - d.updatedAt.getTime()) / 3_600_000;
    const idx = defs.findIndex((b) => h < b.maxH);
    groups[idx === -1 ? groups.length - 1 : idx].items.push(d);
  }
  return groups.filter((g) => g.items.length > 0);
}

function Card({ d, cta, primary, neutral, showStatus }: { d: Item; cta: string; primary?: boolean; neutral?: boolean; showStatus?: boolean }) {
  const v = d.versions[0];
  const u = urgency(d.updatedAt);
  const uploader = v?.uploadedBy;
  const dur = fmtDur(v?.durationSec);
  const clientPhoto = d.project.client?.photoUrl ? `/api/client-asset/photo/${d.project.client.id}` : null;
  const src = d.coverFileAssetId ? `/api/files-asset/${d.coverFileAssetId}` : clientPhoto;
  const UrgencyIcon = u.tier === "danger" ? Flame : u.tier === "warn" ? Clock : Sparkles;
  const color = clientHex(d.project.client?.accentColor);
  const st = deliverableStatusMeta(d.status);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40">
      {/* Color del cliente: tinte suave del recuadro + barra lateral. */}
      {color ? (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{ backgroundColor: color, opacity: 0.06 }} />
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-20 w-1" style={{ backgroundColor: color }} />
        </>
      ) : null}
      <Link href={`/revisiones/${d.id}`} className="relative z-10 flex flex-1 flex-col">
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
          {/* Chip de urgencia (equipo) o de tiempo neutro (con el cliente / entregado). */}
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
            <p className="truncate text-sm font-medium">{d.number ? <span className="mr-1 text-muted-foreground">#{d.number}</span> : null}{d.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              <span className="opacity-80"><EntityEmoji value={d.project.emoji} fallback="🎬" /></span> {d.project.name}{d.project.client ? ` · ${d.project.client.name}` : ""}
            </p>
          </div>
          {/* Sello «Publicado» (interno) manda sobre el chip de estado: en la pestaña Publicados es lo
              que importa. Si no está publicado y se pidió mostrar estado, va el chip de estado normal. */}
          {d.publishedAt ? (
            <span
              className="inline-flex w-fit items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
              title={`Publicado ${sinceLabel(urgency(d.publishedAt))}${d.publishedByName ? ` por ${d.publishedByName}` : ""}`}
            >
              <Rocket className="size-3" /> Publicado{d.publishedByName ? ` · ${d.publishedByName.split(" ")[0]}` : ""}
            </span>
          ) : showStatus && d.status === "ENVIADO_CLIENTE" ? (
            // Afinamos "Enviado a cliente" según si el cliente ya abrió el enlace: pre-aprobado (sin
            // abrir) vs con el cliente (ya lo vio). Mismo criterio que los grupos de «Por aprobar».
            <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${d.reviewVisits > 0 ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"}`}>
              {d.reviewVisits > 0 ? "Con el cliente" : "Pre-aprobado"}
            </span>
          ) : showStatus ? (
            <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${st.className}`}>{st.label}</span>
          ) : null}
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

      {/* Acciones de gestión (solo quien puede gestionar): publicar, copiar enlace, archivar, borrar. */}
      {d.manage ? (
        <div className="relative z-10 border-t border-border/70 bg-card/50 px-3 py-2">
          <DeliverableAdminActions
            deliverableId={d.id}
            projectId={d.project.id}
            reviewUrl={d.reviewUrl}
            linkActive={d.linkActive}
            archived={d.archived}
            name={d.name}
            canPublish={d.canPublish}
            published={d.publishedAt != null}
            publishable={d.status === "APROBADO" || d.status === "ENTREGADO"}
          />
        </div>
      ) : null}
    </div>
  );
}
