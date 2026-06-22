import Link from "next/link";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { restoreClientForm } from "./actions";
import { canAccessProject } from "@/lib/project-access";
import { statusMeta, formatShortDate } from "@/lib/ui";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { tone } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Plus, FolderOpen } from "lucide-react";

export const dynamic = "force-dynamic";

const CLOSED = ["CERRADO", "CANCELADO"];

export default async function ClientesPage() {
  const session = await getSession();

  const clients = await db.client.findMany({
    // Excluye los archivados (borrado suave): no aparecen en la lista normal.
    where: { ...accessibleClientWhere(session), archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { quotes: true } },
      projects: {
        orderBy: { createdAt: "desc" },
        include: {
          lead: { select: { initials: true, avatarColor: true } },
          members: { select: { userId: true, role: true } },
        },
      },
    },
  });

  // Para cada cliente, solo los proyectos que el usuario puede ver.
  const cards = clients.map((c) => {
    const projects = c.projects.filter((p) => canAccessProject(p, session));
    return {
      id: c.id,
      name: c.name,
      emoji: c.emoji,
      description: c.description,
      color: c.accentColor,
      quotes: c._count.quotes,
      projects,
      active: projects.filter((p) => !CLOSED.includes(p.status)).length,
    };
  });

  const totalProjects = cards.reduce((n, c) => n + c.projects.length, 0);
  const canCreate = hasPermission(session, "crear_clientes");

  // Clientes ARCHIVADOS (solo admins): se muestran aparte con opción de restaurar.
  const isAdmin = session?.role === "admin";
  const archived = isAdmin
    ? await db.client.findMany({
        where: { archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        select: { id: true, name: true, emoji: true, archivedAt: true },
      })
    : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cards.length} cliente{cards.length === 1 ? "" : "s"} · {totalProjects} proyecto{totalProjects === 1 ? "" : "s"} en total.
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/clientes/nuevo"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Nuevo cliente
          </Link>
        ) : null}
      </div>

      {cards.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center text-sm text-muted-foreground">
          No tienes clientes visibles todavía.
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cards.map((c) => (
            <div key={c.id} className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
              {/* Cabecera del cliente */}
              <div className="flex items-start gap-3">
                <span
                  style={c.color ? { backgroundColor: `${tone(c.color).hex}24` } : undefined}
                  className={cn("flex size-14 shrink-0 items-center justify-center rounded-xl text-3xl", c.color ? "" : "bg-muted")}
                >{c.emoji ?? "🏢"}</span>
                <div className="min-w-0 flex-1">
                  <Link href={`/clientes/${c.id}`} className="text-lg font-semibold leading-tight hover:underline">
                    {c.name}
                  </Link>
                  {c.description ? <p className="truncate text-xs text-muted-foreground">{c.description}</p> : null}
                </div>
              </div>

              {/* Métricas */}
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <span><strong className="text-foreground">{c.projects.length}</strong> proyectos</span>
                <span><strong className="text-foreground">{c.active}</strong> activos</span>
                <span><strong className="text-foreground">{c.quotes}</strong> cotizaciones</span>
              </div>

              {/* Lista de proyectos */}
              <div className="mt-3 flex-1">
                {c.projects.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Sin proyectos.</p>
                ) : (
                  <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {c.projects.slice(0, 6).map((p) => {
                      const st = statusMeta(p.status);
                      return (
                        <Link
                          key={p.id}
                          href={`/proyectos/${p.id}`}
                          style={c.color ? { backgroundColor: `${tone(c.color).hex}12` } : undefined}
                          className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent/50"
                        >
                          <span className="shrink-0">{p.emoji ?? "🎬"}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                          <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{formatShortDate(p.dueDate) ?? "—"}</span>
                          <Badge className={cn("shrink-0 text-[10px]", st.className)}>{st.label}</Badge>
                          {p.lead ? <UserAvatar initials={p.lead.initials} color={p.lead.avatarColor} size="sm" /> : <span className="size-5 shrink-0" />}
                        </Link>
                      );
                    })}
                    {c.projects.length > 6 ? (
                      <Link href={`/clientes/${c.id}`} className="flex items-center justify-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50">
                        <FolderOpen className="size-3.5" /> Ver los {c.projects.length} proyectos
                      </Link>
                    ) : null}
                  </div>
                )}
              </div>

              <Link href={`/clientes/${c.id}`} className="mt-3 text-xs font-medium text-primary hover:underline">
                Ver ficha del cliente →
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Archivados (solo admin): restaurables; su contenido se conservó intacto. */}
      {archived.length > 0 ? (
        <details className="mt-10 rounded-xl border border-border bg-card/50 p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            🗄️ Archivados ({archived.length})
          </summary>
          <p className="mt-1 text-xs text-muted-foreground">
            Clientes archivados. No se borró nada de su información; al restaurar vuelven a la lista.
          </p>
          <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {archived.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="shrink-0">{c.emoji ?? "🏢"}</span>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                  Archivado {formatShortDate(c.archivedAt) ?? ""}
                </span>
                <form action={restoreClientForm.bind(null, c.id)}>
                  <button className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">
                    Restaurar
                  </button>
                </form>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
