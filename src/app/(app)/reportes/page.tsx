import { redirect } from "next/navigation";
import { SectionChatCard } from "@/components/chat/section-chat-card";
import { PageHeader } from "@/components/ui/page-header";
import { getSession, hasPermission } from "@/lib/auth";
import { TeamPerformance } from "./team-performance";
import { HoursProfitability } from "./profitability";

export const dynamic = "force-dynamic";

export default async function ReportesPage() {
  const session = await getSession();
  if (!hasPermission(session, "ver_reportes")) redirect("/");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader title="Reportes" description="Rendimiento del equipo, horas y cumplimiento." />
      <div className="mb-8"><SectionChatCard section="reportes" /></div>
      <TeamPerformance session={session} />
      <div className="mt-8"><HoursProfitability session={session} /></div>
    </div>
  );
}
