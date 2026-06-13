import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

// Datos por petición desde Postgres → render dinámico (evita prerender en el build de Docker).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [clients, team] = await Promise.all([
    db.client.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { projects: true } } },
    }),
    db.user.findMany({ take: 4, orderBy: { createdAt: "asc" }, select: { initials: true, avatarColor: true } }),
  ]);

  return (
    <AppShell
      user={{
        name: session.name,
        title: session.title,
        initials: session.initials,
        color: session.color,
      }}
      canAdmin={hasPermission(session, "administrar_usuarios")}
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        accentColor: c.accentColor,
        projectCount: c._count.projects,
      }))}
      team={team.map((t) => ({ initials: t.initials, color: t.avatarColor }))}
    >
      {children}
    </AppShell>
  );
}
