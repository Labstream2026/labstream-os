import Link from "next/link";
import { emojiToText } from "@/components/icons/marks";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere, canWriteProject } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { Plus, SearchX, Archive } from "lucide-react";
import { IconProyectos, IconTablero, IconTableroH, IconLista } from "@/components/icons";
import { statusMeta, formatShortDate } from "@/lib/ui";
import { PROJECT_STATUS_DEFAULTS } from "@/lib/project-status";
import { tone } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { ViewTabs } from "./[id]/view-tabs";
import { ProjectFilters } from "./project-filters";
import { PipelineView, MasterTable, PortfolioView, type ViewProject, type StatusCol } from "./projects-views";

export const dynamic = "force-dynamic";

// Búsqueda sin acentos ni mayúsculas.
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Estados que ya no corren contra el reloj (el semáforo de entrega no aplica).
const DONE_STATUSES = new Set(["APROBADO", "ENTREGADO", "CERRADO", "CANCELADO"]);

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; cliente?: string; grupo?: string; vista?: string; vencidos?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  // «Terminados»: archivo de proyectos completados. La vista ACTIVA excluye los terminados
  // (finishedAt=null); la vista «Terminados» muestra solo esos (finishedAt≠null). Ninguna incluye
  // los de la papelera (accessibleProjectWhere ya filtra archivedAt).
  const terminados = sp.vista === "terminados";
  const projectWhere = { ...accessibleProjectWhere(session), finishedAt: terminados ? { not: null } : null };
  // Contador de terminados para la pestaña (independiente de la vista actual).
  const finishedCount = await db.project.count({ where: { ...accessibleProjectWhere(session), finishedAt: { not: null } } }).catch(() => 0);
  // Solo traemos de la BD los proyectos que el usuario puede ver (no todos para
  // descartarlos en JS): el filtro de acceso va en la propia consulta.
  const allClients = await db.client.findMany({
    where: accessibleClientWhere(session),
    orderBy: { createdAt: "asc" },
    include: {
      projects: {
        where: projectWhere,
        orderBy: { createdAt: "asc" },
        include: {
          lead: { select: { initials: true, avatarColor: true } },
          members: { select: { userId: true, role: true, user: { select: { initials: true, avatarColor: true } } } },
          deliverables: { select: { dueDate: true } },
        },
      },
    },
  });

  const withProjects = allClients.filter((c) => c.projects.length > 0);
  const anyProjects = withProjects.length > 0;

  // ── Opciones de filtro (de TODO lo accesible, ANTES de filtrar) ──
  // emojiToText: el campo emoji puede ser un token "ls:<clave>" (ícono Labstream); en un label
  // de TEXTO plano se degrada a su emoji de respaldo — nunca mostrar el token crudo.
  const clientOptions = withProjects.map((c) => ({ value: c.id, label: `${emojiToText(c.emoji) ? `${emojiToText(c.emoji)} ` : ""}${c.name}` }));
  const statusRank = new Map(PROJECT_STATUS_DEFAULTS.map((s, i) => [s.key, i]));
  const statusesPresent = [...new Set(withProjects.flatMap((c) => c.projects.map((p) => p.status)))].sort(
    (a, b) => (statusRank.get(a) ?? 99) - (statusRank.get(b) ?? 99),
  );
  const statusOptions = statusesPresent.map((s) => ({ value: s, label: statusMeta(s).label }));

  const now = Date.now();
  const isOverdue = (p: { dueDate: Date | null; status: string }) =>
    !!p.dueDate && p.dueDate.getTime() < now && !DONE_STATUSES.has(p.status);

  // ── Filtros activos (viven en la URL; el enlace es compartible) ──
  const qRaw = (sp.q ?? "").trim();
  const qn = norm(qRaw);
  const estadoSel = new Set((sp.estado ?? "").split(",").filter(Boolean));
  const clienteSel = new Set((sp.cliente ?? "").split(",").filter(Boolean));
  const grupo = sp.grupo === "estado" ? ("estado" as const) : ("cliente" as const);
  const soloVencidos = sp.vencidos === "1";
  const hasFilters = qRaw !== "" || estadoSel.size > 0 || clienteSel.size > 0 || soloVencidos;

  // Aplica los filtros en memoria (el acceso ya lo acotó la consulta).
  const clients = withProjects
    .filter((c) => clienteSel.size === 0 || clienteSel.has(c.id))
    .map((c) => ({
      ...c,
      projects: c.projects.filter(
        (p) =>
          (estadoSel.size === 0 || estadoSel.has(p.status)) &&
          (!soloVencidos || isOverdue(p)) &&
          (!qn || norm(p.name).includes(qn) || norm(c.name).includes(qn)),
      ),
    }))
    .filter((c) => c.projects.length > 0);

  const total = clients.reduce((n, c) => n + c.projects.length, 0);
  const grandTotal = withProjects.reduce((n, c) => n + c.projects.length, 0);

  // ── Payload de las vistas: fechas formateadas y semáforo calculados EN el servidor
  // (una sola verdad de "hoy"; el cliente solo pinta). ──
  const rows: ViewProject[] = clients.flatMap((c) =>
    c.projects.map((p) => {
      const teamMembers = p.members.filter((m) => m.userId !== p.leadId);
      const team = [
        ...(p.lead ? [{ initials: p.lead.initials, color: p.lead.avatarColor }] : []),
        ...teamMembers.map((m) => ({ initials: m.user.initials, color: m.user.avatarColor })),
      ];
      const dueMs = p.dueDate ? p.dueDate.getTime() : null;
      const days = dueMs != null ? Math.ceil((dueMs - now) / 86400000) : null;
      const dueTone: "bad" | "warn" | null =
        DONE_STATUSES.has(p.status) || days == null ? null : days < 0 ? "bad" : days <= 7 ? "warn" : null;
      const next = p.deliverables
        .filter((d) => d.dueDate && d.dueDate.getTime() >= now)
        .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0]?.dueDate ?? null;
      return {
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        color: p.color,
        // Franja/banda: color del proyecto → color del cliente → índigo por defecto.
        bandHex: p.color ? tone(p.color).hex : c.accentColor ? tone(c.accentColor).hex : "#6366f1",
        status: p.status,
        progress: p.progress,
        dueLabel: formatShortDate(p.dueDate),
        dueTone,
        dueMs,
        clientId: c.id,
        clientName: c.name,
        clientEmoji: c.emoji,
        team: team.slice(0, 4),
        teamCount: team.length,
        deliverables: p.deliverables.length,
        nextDueLabel: formatShortDate(next),
        canMove: canWriteProject(p, session),
      };
    }),
  );

  // Columnas del Pipeline = estados presentes; la lista COMPLETA (efectiva, con overrides)
  // alimenta los selectores de estado y el orden.
  const toCol = (key: string): StatusCol => { const m = statusMeta(key); return { key, label: m.label, className: m.className }; };
  const cols = statusesPresent.map(toCol);
  const allStatuses = PROJECT_STATUS_DEFAULTS.map((s) => toCol(s.key));

  // ── Chips de resumen (del TOTAL accesible, no del filtrado): clic = filtro aplicado ──
  const allRows = withProjects.flatMap((c) => c.projects);
  const chipBase = terminados ? "/proyectos?vista=terminados" : "/proyectos";
  const chipJoin = terminados ? "&" : "?";
  const statusChips = statusesPresent
    .map((s) => ({ ...toCol(s), n: allRows.filter((p) => p.status === s).length }))
    .filter((c) => c.n > 0);
  const overdueCount = allRows.filter(isOverdue).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60"><IconProyectos className="size-6" /></span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Proyectos</h1>
            <p className="text-sm text-muted-foreground">
              {hasFilters ? `${total} de ${grandTotal} proyectos` : `${total} proyectos en ${clients.length} clientes`}
            </p>
          </div>
        </div>
        <Link href="/proyectos/nuevo" className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="size-4" /> Nuevo proyecto
        </Link>
      </div>

      {/* Vista ACTIVOS / TERMINADOS (archivo de proyectos completados, aparte de la papelera). */}
      <div className="mt-4 flex items-center gap-2">
        <Link href="/proyectos" className={cn("rounded-full px-3 py-1 text-sm font-medium transition-colors", !terminados ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-muted")}>
          Activos
        </Link>
        <Link href="/proyectos?vista=terminados" className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors", terminados ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:bg-muted")}>
          <Archive className="size-3.5" /> Terminados{finishedCount > 0 ? ` (${finishedCount})` : ""}
        </Link>
      </div>

      {!anyProjects ? (
        terminados ? (
          <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <Archive className="size-8 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-semibold">No hay proyectos terminados</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Cuando marques un proyecto como «Terminado», se guardará aquí (sin borrarse) y podrás reabrirlo cuando quieras.</p>
          </div>
        ) : (
          <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <div className="text-4xl">🎬</div>
            <h2 className="mt-3 text-lg font-semibold">Aún no hay proyectos</h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Crea tu primer proyecto para organizar tareas, entregables, cronograma y archivos por cliente.</p>
            <Link href="/proyectos/nuevo" className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4" /> Crear proyecto
            </Link>
          </div>
        )
      ) : (
        <div className="mt-5 space-y-4">
          {/* Chips de resumen: el pulso del estudio de un vistazo; clic = filtrar. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {statusChips.map((c) => (
              <Link
                key={c.key}
                href={`${chipBase}${chipJoin}estado=${c.key}`}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-80",
                  c.className,
                  estadoSel.size > 0 && !estadoSel.has(c.key) && "opacity-50",
                )}
              >
                {c.n} {c.label.toLowerCase()}
              </Link>
            ))}
            {overdueCount > 0 && !terminados ? (
              <Link
                href={`${chipBase}${chipJoin}vencidos=1`}
                className={cn("rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700 transition-opacity hover:opacity-80 dark:bg-red-500/15 dark:text-red-300", hasFilters && !soloVencidos && "opacity-50")}
              >
                ● {overdueCount} vencido{overdueCount === 1 ? "" : "s"}
              </Link>
            ) : null}
            {hasFilters ? (
              <Link href={chipBase} className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted">
                × Limpiar
              </Link>
            ) : null}
          </div>

          <ProjectFilters statusOptions={statusOptions} clientOptions={clientOptions} />
          {total === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
              <SearchX className="size-7 text-muted-foreground" />
              <h2 className="mt-3 text-lg font-semibold">Sin resultados</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Ningún proyecto coincide con los filtros. Ajústalos o límpialos para ver todos.</p>
            </div>
          ) : (
            <ViewTabs
              storageKey="proyectos-view-v2"
              views={[
                { key: "pipeline", label: "Pipeline", icon: <IconTablero />, node: <PipelineView cols={cols} allStatuses={allStatuses} projects={rows} /> },
                { key: "tabla", label: "Tabla", icon: <IconLista />, node: <MasterTable projects={rows} allStatuses={allStatuses} grupo={grupo} /> },
                { key: "portafolio", label: "Portafolio", icon: <IconTableroH />, node: <PortfolioView projects={rows} allStatuses={allStatuses} /> },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}
