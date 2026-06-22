import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { aiEnabled } from "@/lib/ai";
import { AssistantChat } from "./assistant-chat";

export const dynamic = "force-dynamic";

export default async function AsistentePage() {
  const session = await getSession();
  if (!hasPermission(session, "ver_asistente")) redirect("/");
  const all = await db.project.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, name: true, isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } },
    take: 200,
  });
  // Solo proyectos a los que el usuario tiene acceso (no se filtran nombres ajenos).
  const projects = all.filter((p) => canAccessProject(p, session));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight">Asistente IA</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        Tu copiloto para correos, resúmenes, ideas y planificación.
      </p>
      <AssistantChat
        enabled={aiEnabled}
        projects={projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
      />
    </div>
  );
}
