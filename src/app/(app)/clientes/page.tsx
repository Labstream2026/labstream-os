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

export const dynamic = "force-dynamic";

const CLOSED = ["CERRADO", "CANCELADO"];

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
    const projects = c.projects.filter((p) => canAccessProject(p, session));
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
  // Los clientes archivados (borrado suave) viven ahora en la Papelera (/papelera), unificados
  // con los proyectos archivados — no se duplican aquí.

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{showInactive ? "Clientes inactivos" : "Clientes"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {showInactive
              ? `${cards.length} cliente${cards.length === 1 ? "" : "s"} desactivado${cards.length === 1 ? "" : "s"}. Reactívalos abriendo su ficha → Ajustes.`
              : `${cards.length} cliente${cards.length === 1 ? "" : "s"} · ${totalProjects} proyecto${totalProjects === 1 ? "" : "s"} en total.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showInactive ? (
            <Link href="/clientes" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
              ← Ver activos
            </Link>
          ) : inactiveCount > 0 ? (
            <Link href="/clientes?inactivos=1" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
              <PowerOff className="size-4" /> Ver inactivos ({inactiveCount})
            </Link>
          ) : null}
          {canCreate && !showInactive ? (
            <Link
              href="/clientes/nuevo"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" /> Nuevo cliente
            </Link>
          ) : null}
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center text-sm text-muted-foreground">
          {showInactive ? "No hay clientes inactivos." : "No tienes clientes visibles todavía."}
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => {
            const accent = c.color ? tone(c.color).hex : null;
            const initial = (c.name.trim().charAt(0) || "C").toUpperCase();
            return (
              <div key={c.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/30">
                {/* Franja de color del cliente */}
                <div className="h-1.5 w-full" style={{ background: accent ?? "hsl(var(--primary))" }} />
                <div className="flex flex-1 flex-col p-5">
                  {/* Cabecera: avatar + nombre */}
                  <div className="flex items-center gap-3">
                    <span
                      style={accent ? { backgroundColor: `${accent}24`, color: accent } : undefined}
                      className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl text-2xl font-semibold", accent ? "" : "bg-muted text-foreground")}
                    >{c.emoji ?? initial}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/clientes/${c.id}`} className="block truncate text-lg font-semibold leading-tight hover:underline">
                        {c.name}
                      </Link>
                      {c.description ? <p className="truncate text-xs text-muted-foreground">{c.description}</p> : null}
                    </div>
                  </div>

                  {/* Métricas */}
                  <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                    <span><strong className="font-medium text-foreground">{c.projects.length}</strong> proyectos</span>
                    <span><strong className="font-medium text-foreground">{c.active}</strong> activos</span>
                    <span><strong className="font-medium text-foreground">{c.quotes}</strong> cotizaciones</span>
                  </div>

                  {/* Avance general del cliente (promedio de progreso de sus proyectos) */}
                  {c.projects.length ? (
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${c.progress}%`, background: accent ?? "hsl(var(--primary))" }} />
                      </div>
                      <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">{c.progress}%</span>
                    </div>
                  ) : null}

                  {/* Vista previa de proyectos */}
                  <div className="mt-3 flex-1">
                    {c.projects.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Sin proyectos.</p>
                    ) : (
                      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                        {c.projects.slice(0, 5).map((p) => {
                          const st = statusMeta(p.status);
                          const closed = CLOSED.includes(p.status);
                          return (
                            <Link
                              key={p.id}
                              href={`/proyectos/${p.id}`}
                              className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent/50"
                            >
                              <span className="size-2 shrink-0 rounded-full" style={{ background: closed ? "hsl(var(--muted-foreground))" : (accent ?? "hsl(var(--primary))") }} />
                              <span className="min-w-0 flex-1 truncate font-medium">{p.emoji ? `${p.emoji} ` : ""}{p.name}</span>
                              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{closed ? st.label : `${p.progress}%`}</span>
                              {p.lead ? <UserAvatar initials={p.lead.initials} color={p.lead.avatarColor} size="sm" /> : <span className="size-5 shrink-0" />}
                            </Link>
                          );
                        })}
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
      )}

    </div>
  );
}
