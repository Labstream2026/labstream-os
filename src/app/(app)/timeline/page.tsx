import { redirect } from "next/navigation";
import { getSession, hasPermission } from "@/lib/auth";
import { buildSessionTimeline } from "@/lib/timeline-data";
import { GlobalTimeline } from "./global-timeline";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const session = await getSession();
  // El cronograma general es una vista cross-proyecto: requiere ver_proyectos.
  if (!hasPermission(session, "ver_proyectos")) redirect("/");

  const { clients, milestones, undatedCount } = await buildSessionTimeline(session);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Cronograma general</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Línea de tiempo de todos los proyectos del estudio, con rodajes y entregas. Arrastra la barra de un proyecto para reprogramarlo o haz clic para abrirlo.
          {undatedCount > 0 ? ` · ${undatedCount} proyecto${undatedCount === 1 ? "" : "s"} sin fechas (asígnalas dentro del proyecto).` : ""}
        </p>
      </div>
      <GlobalTimeline clients={clients} milestones={milestones} />
    </div>
  );
}
