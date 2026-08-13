import { redirect } from "next/navigation";
import { SectionChatCard } from "@/components/chat/section-chat-card";
import { getSession, hasPermission } from "@/lib/auth";
import { construirReporte } from "@/lib/reportes/datos";
import { ReportesShell } from "./reportes-shell";

export const dynamic = "force-dynamic";

// Reportes v2 (rediseño aprobado por prototipo): cinco CASOS de enfoque —Estudio, Entregas,
// Equipo, Clientes, Finanzas— con un PERIODO global (?p=mes|90|ano|todo, ?m=YYYY-MM) que el
// servidor recalcula entero en lib/reportes/datos. El chat de sección baja al PIE: antes se
// comía el primer pantallazo. El desempeño del Inicio sigue usando team-performance aparte.
export default async function ReportesPage({ searchParams }: { searchParams: Promise<{ p?: string; m?: string }> }) {
  const session = await getSession();
  if (!hasPermission(session, "ver_reportes")) redirect("/");
  const sp = await searchParams;
  const datos = await construirReporte(session, sp);

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-7">
      <ReportesShell datos={datos} />
      <div className="mt-8"><SectionChatCard section="reportes" /></div>
    </div>
  );
}
