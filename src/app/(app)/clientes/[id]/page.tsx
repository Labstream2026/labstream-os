import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ProjectCard } from "@/components/project-card";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: {
      projects: {
        orderBy: { createdAt: "asc" },
        include: { lead: { select: { initials: true, avatarColor: true } } },
      },
    },
  });

  if (!client) notFound();

  const active = client.projects.filter((p) => !["CERRADO", "CANCELADO"].includes(p.status)).length;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-xl bg-muted text-3xl">
          {client.emoji ?? "🏢"}
        </span>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{client.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {client.description} · {client.projects.length} proyecto
            {client.projects.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-4">
        <Stat value={client.projects.length} label="Proyectos" />
        <Stat value={active} label="Activos" />
        <Stat value={0} label="Cotizaciones" hint="Fase 4" />
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Proyectos</h2>
      {client.projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Este cliente aún no tiene proyectos.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {client.projects.map((p) => (
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
      )}
    </div>
  );
}

function Stat({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
