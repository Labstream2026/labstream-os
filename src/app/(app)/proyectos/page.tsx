import Link from "next/link";
import { db } from "@/lib/db";
import { ProjectCard } from "@/components/project-card";
import { LayoutGrid, List, Calendar, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProyectosPage() {
  const clients = await db.client.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      projects: {
        orderBy: { createdAt: "asc" },
        include: { lead: { select: { initials: true, avatarColor: true } } },
      },
    },
  });

  const total = clients.reduce((n, c) => n + c.projects.length, 0);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proyectos</h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} proyectos en {clients.length} clientes</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <button className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium">
              <LayoutGrid className="size-3.5" /> Tablero
            </button>
            <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              <List className="size-3.5" /> Lista
            </button>
            <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="size-3.5" /> Calendario
            </button>
          </div>
          <Link
            href="/proyectos/nuevo"
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Nuevo proyecto
          </Link>
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {clients.map((c) => (
          <section key={c.id}>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-base">{c.emoji}</span>
              <h2 className="text-sm font-semibold">{c.name}</h2>
              <span className="text-xs text-muted-foreground">· {c.projects.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {c.projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={{
                    id: p.id,
                    name: p.name,
                    emoji: p.emoji,
                    status: p.status,
                    progress: p.progress,
                    dueDate: p.dueDate,
                    lead: p.lead ? { initials: p.lead.initials, color: p.lead.avatarColor } : null,
                  }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
