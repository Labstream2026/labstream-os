import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { WIZARDS } from "@/lib/templates";
import { NewProjectForm } from "./new-project-form";

export const dynamic = "force-dynamic";

export default async function NuevoProyectoPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; clientId?: string }>;
}) {
  const session = await getSession();
  if (!hasPermission(session, "crear_proyectos")) redirect("/proyectos");
  const { template = "", clientId = "" } = await searchParams;
  const isCliente = session?.role === "cliente";

  const clients = await db.client.findMany({ where: accessibleClientWhere(session), orderBy: { name: "asc" }, select: { id: true, name: true } });
  const clientIds = clients.map((c) => c.id);
  const [team, templates] = await Promise.all([
    // El cliente puede proponer CON QUIÉN trabajar, pero solo entre la gente que YA conoce:
    // responsables de su cuenta y equipos de los proyectos de sus clientes (nunca el directorio
    // completo de la empresa). El equipo interno sigue viendo a todos.
    isCliente
      ? db.user.findMany({
          where: {
            active: true,
            isSystemBot: false,
            role: { key: { notIn: ["cliente", "demo"] } },
            OR: [
              { clientMemberships: { some: { clientId: { in: clientIds } } } },
              { projectMemberships: { some: { project: { clientId: { in: clientIds } } } } },
              { ledProjects: { some: { clientId: { in: clientIds } } } },
            ],
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.projectTemplate.findMany({ orderBy: { name: "asc" }, select: { key: true, name: true, emoji: true } }),
  ]);

  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/proyectos" className="text-sm text-muted-foreground hover:text-foreground">← Proyectos</Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Nuevo proyecto</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isCliente
          ? "Cuéntanos qué necesitas y déjalo creado. El equipo de Labstream lo tomará y lo configurará contigo."
          : "Al usar una plantilla se generan carpetas, tareas, entregables y tableros. Si la plantilla tiene preguntas, complétalas para dejar el proyecto listo."}
      </p>

      <NewProjectForm
        clients={clients}
        team={team}
        templates={templates}
        wizards={WIZARDS}
        initialTemplate={template}
        initialClient={clientId}
        isCliente={isCliente}
      />
    </div>
  );
}
