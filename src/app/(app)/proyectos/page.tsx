import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { Plus, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusMeta, formatShortDate } from "@/lib/ui";
import { PROJECT_STATUS_DEFAULTS } from "@/lib/project-status";
import { cn } from "@/lib/utils";
import { ViewTabs } from "./[id]/view-tabs";
import { ProjectColorPicker } from "./project-color-picker";
import { ProjectsBoard, type BoardClient } from "./projects-board";
import { ProjectFilters } from "./project-filters";

export const dynamic = "force-dynamic";

// Búsqueda sin acentos ni mayúsculas.
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export default async function ProyectosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; cliente?: string; grupo?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  // Solo traemos de la BD los proyectos que el usuario puede ver (no todos para
  // descartarlos en JS): el filtro de acceso va en la propia consulta.
  const allClients = await db.client.findMany({
    where: accessibleClientWhere(session),
    orderBy: { createdAt: "asc" },
    include: {
      projects: {
        where: accessibleProjectWhere(session),
        orderBy: { createdAt: "asc" },
        include: {
          lead: { select: { initials: true, avatarColor: true } },
          members: { select: { userId: true, role: true } },
          deliverables: { select: { name: true, dueDate: true } },
        },
      },
    },
  });

  const withProjects = allClients.filter((c) => c.projects.length > 0);
  const anyProjects = withProjects.length > 0;

  // ── Opciones de filtro (de TODO lo accesible, ANTES de filtrar) ──
  const clientOptions = withProjects.map((c) => ({ value: c.id, label: `${c.emoji ? `${c.emoji} ` : ""}${c.name}` }));
  const statusRank = new Map(PROJECT_STATUS_DEFAULTS.map((s, i) => [s.key, i]));
  const statusesPresent = [...new Set(withProjects.flatMap((c) => c.projects.map((p) => p.status)))].sort(
    (a, b) => (statusRank.get(a) ?? 99) - (statusRank.get(b) ?? 99),
  );
  const statusOptions = statusesPresent.map((s) => ({ value: s, label: statusMeta(s).label }));

  // ── Filtros activos (viven en la URL; el enlace es compartible) ──
  const qRaw = (sp.q ?? "").trim();
  const qn = norm(qRaw);
  const estadoSel = new Set((sp.estado ?? "").split(",").filter(Boolean));
  const clienteSel = new Set((sp.cliente ?? "").split(",").filter(Boolean));
  const grupo = sp.grupo === "estado" ? "estado" : "cliente";
  const hasFilters = qRaw !== "" || estadoSel.size > 0 || clienteSel.size > 0;

  // Aplica los filtros en memoria (el acceso ya lo acotó la consulta).
  const clients = withProjects
    .filter((c) => clienteSel.size === 0 || clienteSel.has(c.id))
    .map((c) => ({
      ...c,
      projects: c.projects.filter(
        (p) => (estadoSel.size === 0 || estadoSel.has(p.status)) && (!qn || norm(p.name).includes(qn) || norm(c.name).includes(qn)),
      ),
    }))
    .filter((c) => c.projects.length > 0);

  const total = clients.reduce((n, c) => n + c.projects.length, 0);

  // Vista Tablero (cards por cliente; vertical y horizontal son pestañas aparte — ProjectsBoard)
  const boardClients: BoardClient[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.accentColor,
    projects: c.projects.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      status: p.status,
      progress: p.progress,
      dueDate: p.dueDate ? p.dueDate.toISOString() : null,
      lead: p.lead ? { initials: p.lead.initials, color: p.lead.avatarColor } : null,
    })),
  }));
  const boardV = <ProjectsBoard clients={boardClients} orientation="vertical" />;
  const boardH = <ProjectsBoard clients={boardClients} orientation="horizontal" />;

  const progressCell = (progress: number) => (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div>
      <span className="text-xs text-muted-foreground">{progress}%</span>
    </div>
  );

  // Vista Lista agrupada por CLIENTE (una tabla por cliente).
  const listByClient = (
    <div className="space-y-8">
      {clients.map((c) => (
        <section key={c.id}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-2xl">{c.emoji}</span>
            <h2 className="text-xl font-bold tracking-tight">{c.name}</h2>
            <span className="text-xs text-muted-foreground">· {c.projects.length}</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Color</th>
                  <th className="px-3 py-2 font-medium">Proyecto</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Progreso</th>
                  <th className="px-3 py-2 font-medium">Entrega</th>
                </tr>
              </thead>
              <tbody>
                {c.projects.map((p) => {
                  const st = statusMeta(p.status);
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2"><ProjectColorPicker projectId={p.id} color={p.color} /></td>
                      <td className="px-3 py-2">
                        <Link href={`/proyectos/${p.id}`} className="font-medium hover:underline">{p.emoji} {p.name}</Link>
                      </td>
                      <td className="px-3 py-2"><Badge className={cn("text-[10px]", st.className)}>{st.label}</Badge></td>
                      <td className="px-3 py-2">{progressCell(p.progress)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{formatShortDate(p.dueDate) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );

  // Vista Lista agrupada por ESTADO (una tabla por estado, con el cliente en cada fila).
  const flat = clients.flatMap((c) => c.projects.map((p) => ({ p, clientName: c.name, clientEmoji: c.emoji })));
  const listByStatus = (
    <div className="space-y-8">
      {statusesPresent
        .map((s) => ({ s, rows: flat.filter((x) => x.p.status === s) }))
        .filter(({ rows }) => rows.length > 0)
        .map(({ s, rows }) => {
          const st = statusMeta(s);
          return (
            <section key={s}>
              <div className="mb-2 flex items-center gap-2">
                <Badge className={cn("text-[11px]", st.className)}>{st.label}</Badge>
                <span className="text-xs text-muted-foreground">· {rows.length}</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Color</th>
                      <th className="px-3 py-2 font-medium">Proyecto</th>
                      <th className="px-3 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">Progreso</th>
                      <th className="px-3 py-2 font-medium">Entrega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ p, clientName, clientEmoji }) => (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2"><ProjectColorPicker projectId={p.id} color={p.color} /></td>
                        <td className="px-3 py-2">
                          <Link href={`/proyectos/${p.id}`} className="font-medium hover:underline">{p.emoji} {p.name}</Link>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{clientEmoji} {clientName}</td>
                        <td className="px-3 py-2">{progressCell(p.progress)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{formatShortDate(p.dueDate) ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
    </div>
  );

  const list = grupo === "estado" ? listByStatus : listByClient;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proyectos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasFilters ? `${total} de ${withProjects.reduce((n, c) => n + c.projects.length, 0)} proyectos` : `${total} proyectos en ${clients.length} clientes`}
          </p>
        </div>
        <Link href="/proyectos/nuevo" className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="size-4" /> Nuevo proyecto
        </Link>
      </div>

      {!anyProjects ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <div className="text-4xl">🎬</div>
          <h2 className="mt-3 text-lg font-semibold">Aún no hay proyectos</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Crea tu primer proyecto para organizar tareas, entregables, cronograma y archivos por cliente.</p>
          <Link href="/proyectos/nuevo" className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> Crear proyecto
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <ProjectFilters statusOptions={statusOptions} clientOptions={clientOptions} />
          {total === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
              <SearchX className="size-7 text-muted-foreground" />
              <h2 className="mt-3 text-lg font-semibold">Sin resultados</h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">Ningún proyecto coincide con los filtros. Ajústalos o límpialos para ver todos.</p>
            </div>
          ) : (
            <ViewTabs
              storageKey="proyectos-view"
              views={[
                { key: "tablero-v", label: "Tablero vertical", icon: "▤", node: boardV },
                { key: "tablero-h", label: "Tablero horizontal", icon: "▥", node: boardH },
                { key: "lista", label: "Lista", icon: "☰", node: list },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}
