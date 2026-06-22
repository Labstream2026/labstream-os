import { redirect } from "next/navigation";
import { getSession, hasPermission } from "@/lib/auth";
import { TeamPerformance } from "./team-performance";

export const dynamic = "force-dynamic";

export default async function ReportesPage() {
  const session = await getSession();
  if (!hasPermission(session, "ver_reportes")) redirect("/");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Reportes</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">Vista general del estudio: proyectos, horas y carga del equipo.</p>
      <TeamPerformance session={session} />
    </div>
  );
}
