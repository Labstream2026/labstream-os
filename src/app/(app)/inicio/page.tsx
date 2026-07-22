import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { formatBogota } from "@/lib/bogota-time";
import { getClientHomeData } from "@/lib/client-home-data";
import { ClientHomeView } from "@/components/client-home-view";
import { ClientPortalNav } from "@/components/client-portal-nav";

export const dynamic = "force-dynamic";

// ── INICIO del cliente ──
// El aterrizaje del portal responde en 5 segundos «¿cómo va mi proceso?»: qué le toca hacer,
// en qué fase va cada proyecto y qué pasó últimamente. Solo para el rol cliente (el equipo
// tiene su propio Inicio en "/").
export default async function InicioClientePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "cliente") redirect("/");

  const [data, membership] = await Promise.all([
    getClientHomeData({ id: session.id, name: session.name }),
    db.clientMember.findFirst({
      where: { userId: session.id },
      select: { client: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const firstName = session.name.split(" ")[0] || session.name;
  const today = formatBogota(new Date(), { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hola, {firstName} 👋</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {membership?.client.name ? `${membership.client.name} · ` : ""}
            {today}
          </p>
        </div>
        {hasPermission(session, "crear_proyectos") ? (
          <Link
            href="/proyectos/nuevo"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            <Plus className="size-4" /> Nuevo proyecto
          </Link>
        ) : null}
      </header>

      <ClientPortalNav active="inicio" />
      <ClientHomeView data={data} />
    </div>
  );
}
