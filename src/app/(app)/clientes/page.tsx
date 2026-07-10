import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { canAccessProject } from "@/lib/project-access";
import { statusMeta } from "@/lib/ui";
import { UserAvatar } from "@/components/user-avatar";
import { tone } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Plus, FolderOpen, PowerOff } from "lucide-react";
import { IconCliente, IconTarjetas, IconLista } from "@/components/icons";
import { EntityEmoji } from "@/components/icons/marks";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ViewTabs } from "../proyectos/[id]/view-tabs";
import { ClientCardMenu } from "./client-card-menu";

export const dynamic = "force-dynamic";

const CLOSED = ["CERRADO", "CANCELADO"];

type CardProject = {
  id: string;
  name: string;
  emoji: string | null;
  status: string;
  progress: number;
  lead: { initials: string | null; avatarColor: string | null } | null;
};

// Fila de proyecto reutilizada en las vistas Tarjetas y Columnas (punto de estado + nombre + %).
function ProjectRow({ p, accent }: { p: CardProject; accent: string | null }) {
  const st = statusMeta(p.status);
  const closed = CLOSED.includes(p.status);
  return (
    <Link href={`/proyectos/${p.id}`} className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent/50">
      <span className="size-2 shrink-0 rounded-full" style={{ background: closed ? "hsl(var(--muted-foreground))" : (accent ?? "hsl(var(--primary))") }} />
      <span className="min-w-0 flex-1 truncate font-medium">{p.emoji ? <><EntityEmoji value={p.emoji} />{" "}</> : null}{p.name}</span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{closed ? st.label : `${p.progress}%`}</span>
      {p.lead ? <UserAvatar initials={p.lead.initials} color={p.lead.avatarColor} size="sm" /> : <span className="size-5 shrink-0" />}
    </Link>
  );
}

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ inactivos?: string }> }) {
  const session = await getSession();
  // La zona Clientes requiere el permiso ver_clientes (admin lo tiene por bypass). Sin él,
  // fuera. Los datos siguen acotados a los clientes accesibles (membresía/proyectos).
  if (!hasPermission(session, "ver_clientes")) redirect("/");

  // Vista por defecto: solo clientes ACTIVOS. Con ?inactivos=1 se muestran los desactivados
  // (para reactivar un cliente viejo cuando llega un proyecto nuevo).
  const { inactivos } = await searchParams;
  const showInactive = inactivos === "1";

  const [clients, inactiveCount] = await Promise.all([
    db.client.findMany({
    // Excluye los archivados (papelera); filtra por activo/inactivo según la vista.
    where: { ...accessibleClientWhere(session), archivedAt: null, isActive: !showInactive },
    // Alfabético por nombre; se afina abajo con localeCompare (insensible a mayúsculas/acentos).
    orderBy: { name: "asc" },
    include: {
      _count: { select: { quotes: true } },
      projects: {
        where: { archivedAt: null },
        orderBy: { createdAt: "desc" },
        include: {
          lead: { select: { initials: true, avatarColor: true } },
          members: { select: { userId: true, role: true } },
        },
      },
    },
    }),
    // Cuántos inactivos hay (para el botón "Ver inactivos"), respetando el acceso.
    db.client.count({ where: { ...accessibleClientWhere(session), archivedAt: null, isActive: false } }),
  ]);
  // Orden alfabético real: insensible a mayúsculas/acentos y con reglas del español.
  clients.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  // Para cada cliente, solo los proyectos que el usuario puede ver.
  const cards = clients.map((c) => {
    const projects: CardProject[] = c.projects
      .filter((p) => canAccessProject(p, session))
      .map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, status: p.status, progress: p.progress, lead: p.lead ? { initials: p.lead.initials, avatarColor: p.lead.avatarColor } : null }));
    const progress = projects.length ? Math.round(projects.reduce((s, p) => s + (p.progress ?? 0), 0) / projects.length) : 0;
    return {
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      description: c.description,
      color: c.accentColor,
      quotes: c._count.quotes,
      projects,
      progress,
      active: projects.filter((p) => !CLOSED.includes(p.status)).length,
    };
  });

  const totalProjects = cards.reduce((n, c) => n + c.projects.length, 0);
  const canCreate = hasPermission(session, "crear_clientes");
  // Para el menú de la tarjeta: crear proyecto (permiso propio) y archivar (solo admin).
  const canCreateProject = hasPermission(session, "crear_proyectos");
  const isAdmin = session?.role === "admin";
  // Los clientes archivados (borrado suave) viven ahora en la Papelera (/papelera), unificados
  // con los proyectos archivados — no se duplican aquí.

  // ── Vista TARJETAS ── cuadrícula de tarjetas ricas (franja de color, avatar, métricas, avance).
  const cardsNode = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => {
        const accent = c.color ? tone(c.color).hex : null;
        const initial = (c.name.trim().charAt(0) || "C").toUpperCase();
        return (
          <div key={c.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/30">
            <div className="h-1.5 w-full" style={{ background: accent ?? "hsl(var(--primary))" }} />
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-center gap-3">
                <span
                  style={accent ? { backgroundColor: `${accent}24`, color: accent } : undefined}
                  className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl font-semibold", accent ? "" : "bg-muted text-foreground")}
                ><EntityEmoji value={c.emoji} fallback={initial} className="size-7" /></span>
                <div className="min-w-0 flex-1">
                  <Link href={`/clientes/${c.id}`} className="block truncate text-lg font-semibold leading-tight hover:underline">
                    {c.name}
                  </Link>
                  {c.description ? <p className="truncate text-xs text-muted-foreground">{c.description}</p> : null}
                </div>
                <ClientCardMenu clientId={c.id} clientName={c.name} canCreateProject={canCreateProject} canArchive={isAdmin} />
              </div>

              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span><strong className="font-medium text-foreground">{c.projects.length}</strong> proyectos</span>
                <span><strong className="font-medium text-foreground">{c.active}</strong> activos</span>
                <span><strong className="font-medium text-foreground">{c.quotes}</strong> cotizaciones</span>
              </div>

              {c.projects.length ? (
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${c.progress}%`, background: accent ?? "hsl(var(--primary))" }} />
                  </div>
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">{c.progress}%</span>
                </div>
              ) : null}

              <div className="mt-3 flex-1">
                {c.projects.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Sin proyectos.</p>
                ) : (
                  <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {c.projects.slice(0, 5).map((p) => <ProjectRow key={p.id} p={p} accent={accent} />)}
                    {c.projects.length > 5 ? (
                      <Link href={`/clientes/${c.id}`} className="flex items-center justify-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50">
                        <FolderOpen className="size-3.5" /> Ver los {c.projects.length} proyectos
                      </Link>
                    ) : null}
                  </div>
                )}
              </div>

              <Link href={`/clientes/${c.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Ver ficha del cliente →
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Vista LISTA ── tabla a nivel de cliente (resumen compacto, una fila por cliente).
  const listNode = (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Cliente</th>
            <th className="px-3 py-2.5 font-medium">Proyectos</th>
            <th className="px-3 py-2.5 font-medium">Activos</th>
            <th className="px-3 py-2.5 font-medium">Cotizaciones</th>
            <th className="px-3 py-2.5 font-medium">Avance</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => {
            const accent = c.color ? tone(c.color).hex : null;
            const initial = (c.name.trim().charAt(0) || "C").toUpperCase();
            return (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-4 py-2.5">
                  <Link href={`/clientes/${c.id}`} className="flex items-center gap-2.5 font-medium hover:underline">
                    <span
                      style={accent ? { backgroundColor: `${accent}24`, color: accent } : undefined}
                      className={cn("flex size-7 shrink-0 items-center justify-center rounded-md text-sm", accent ? "" : "bg-muted text-foreground")}
                    ><EntityEmoji value={c.emoji} fallback={initial} className="size-4.5" /></span>
                    <span className="truncate">{c.name}</span>
                  </Link>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{c.projects.length}</td>
                <td className="px-3 py-2.5 tabular-nums">{c.active}</td>
                <td className="px-3 py-2.5 tabular-nums">{c.quotes}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${c.progress}%`, background: accent ?? "hsl(var(--primary))" }} />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{c.progress}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconCliente />}
        title={showInactive ? "Clientes inactivos" : "Clientes"}
        description={
          showInactive
            ? `${cards.length} cliente${cards.length === 1 ? "" : "s"} desactivado${cards.length === 1 ? "" : "s"}. Reactívalos abriendo su ficha → Ajustes.`
            : `${cards.length} cliente${cards.length === 1 ? "" : "s"} · ${totalProjects} proyecto${totalProjects === 1 ? "" : "s"} en total.`
        }
        actions={
          canCreate && !showInactive ? (
            <Link
              href="/clientes/nuevo"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" /> Nuevo cliente
            </Link>
          ) : undefined
        }
      />

      {/* Toggle activos/inactivos: filtro de vista, vive debajo del encabezado. */}
      {showInactive ? (
        <div className="-mt-2 mb-6">
          <Link href="/clientes" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
            ← Ver activos
          </Link>
        </div>
      ) : inactiveCount > 0 ? (
        <div className="-mt-2 mb-6">
          <Link href="/clientes?inactivos=1" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
            <PowerOff className="size-4" /> Ver inactivos ({inactiveCount})
          </Link>
        </div>
      ) : null}

      {cards.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={<IconCliente />}
            title={showInactive ? "No hay clientes inactivos" : "Aún no hay clientes"}
            description={
              showInactive
                ? "Todos tus clientes están activos por ahora."
                : "No tienes clientes visibles todavía. Cuando se creen o se te asignen, aparecerán aquí."
            }
          />
        </div>
      ) : showInactive ? (
        <div className="mt-8">{cardsNode}</div>
      ) : (
        <div className="mt-6">
          <ViewTabs
            storageKey="clientes-view"
            views={[
              { key: "tarjetas", label: "Tarjetas", icon: <IconTarjetas />, node: cardsNode },
              { key: "lista", label: "Lista", icon: <IconLista />, node: listNode },
            ]}
          />
        </div>
      )}

    </div>
  );
}
