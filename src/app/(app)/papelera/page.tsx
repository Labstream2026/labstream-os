import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { formatShortDate } from "@/lib/ui";
import { PapeleraActions } from "./papelera-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { IconPapelera } from "@/components/icons";
import { FolderOpen, Building2 } from "lucide-react";

export const dynamic = "force-dynamic";

// Papelera unificada: proyectos y clientes ARCHIVADOS (borrado suave). Nada se borra
// físicamente; desde aquí se RESTAURAN. Solo visible con el permiso ver_papelera
// (admin por bypass) → "algunos administradores".
// Días que lleva algo en la papelera (redondeo hacia abajo; mínimo 0). Vive FUERA del
// componente: el "ahora" por-request es legítimo en esta página dinámica.
function daysInTrash(archivedAt: Date | null): number {
  if (!archivedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - archivedAt.getTime()) / 86_400_000));
}

// Sub-línea de una fila de la papelera: fecha + antigüedad («hace N días»).
function trashedLine(prefix: string, archivedAt: Date | null, dateLabel: string | null): string {
  const d = daysInTrash(archivedAt);
  const ago = d === 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`;
  return `${prefix}Archivado ${dateLabel ?? ""} · ${ago}`;
}

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
      // _count.projects: el cliente arrastra sus proyectos a la papelera — la fila lo dice.
      select: { id: true, name: true, emoji: true, archivedAt: true, _count: { select: { projects: true } } },
    }),
  ]);

  const empty = projects.length === 0 && clients.length === 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconPapelera />}
        title="Papelera"
        description="Elementos borrados; se conservan aquí antes de eliminarse definitivamente."
      />

      {empty ? (
        <div className="mt-10">
          <EmptyState
            icon={<IconPapelera />}
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
                    {trashedLine(p.client?.name ? `${p.client.name} · ` : "", p.archivedAt, formatShortDate(p.archivedAt))}
                  </p>
                </div>
                {daysInTrash(p.archivedAt) >= 90 ? (
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400" title="Lleva más de 90 días en la papelera: restáuralo o bórralo definitivamente.">
                    90+ días
                  </span>
                ) : null}
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
                  <p className="truncate text-xs text-muted-foreground">{trashedLine(c._count.projects ? `${c._count.projects} proyecto${c._count.projects === 1 ? "" : "s"} dentro · ` : "", c.archivedAt, formatShortDate(c.archivedAt))}</p>
                </div>
                {daysInTrash(c.archivedAt) >= 90 ? (
                  <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400" title="Lleva más de 90 días en la papelera: restáuralo o bórralo definitivamente.">
                    90+ días
                  </span>
                ) : null}
                <PapeleraActions kind="client" id={c.id} name={c.name} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
