import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { formatShortDate } from "@/lib/ui";
import { PapeleraActions } from "./papelera-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Trash2, FolderOpen, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

// Papelera unificada: proyectos y clientes ARCHIVADOS (borrado suave). Nada se borra
// físicamente; desde aquí se RESTAURAN. Solo visible con el permiso ver_papelera
// (admin por bypass) → "algunos administradores".
export default async function PapeleraPage() {
  const session = await getSession();
  if (!hasPermission(session, "ver_papelera")) redirect("/");

  const [projects, clients] = await Promise.all([
    db.project.findMany({
      where: { archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
      select: { id: true, name: true, emoji: true, archivedAt: true, client: { select: { name: true } } },
    }),
    db.client.findMany({
      where: { archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
      select: { id: true, name: true, emoji: true, archivedAt: true },
    }),
  ]);

  const empty = projects.length === 0 && clients.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title="Papelera"
        description="Elementos borrados; se conservan aquí antes de eliminarse definitivamente."
      />

      {empty ? (
        <div className="mt-10">
          <EmptyState
            icon={<Trash2 />}
            title="La papelera está vacía"
            description="Los elementos que borres aparecerán aquí antes de eliminarse definitivamente."
          />
        </div>
      ) : null}

      {/* Proyectos archivados */}
      {projects.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <FolderOpen className="size-3.5" /> Proyectos ({projects.length})
          </h2>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {projects.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="shrink-0 text-lg">{p.emoji ?? "🎬"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.client?.name ? `${p.client.name} · ` : ""}Archivado {formatShortDate(p.archivedAt) ?? ""}
                  </p>
                </div>
                <PapeleraActions kind="project" id={p.id} name={p.name} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Clientes archivados */}
      {clients.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Building2 className="size-3.5" /> Clientes ({clients.length})
          </h2>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {clients.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="shrink-0 text-lg">{c.emoji ?? "🏢"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">Archivado {formatShortDate(c.archivedAt) ?? ""}</p>
                </div>
                <PapeleraActions kind="client" id={c.id} name={c.name} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
