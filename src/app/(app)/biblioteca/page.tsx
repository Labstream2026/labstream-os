import { redirect } from "next/navigation";
import { SectionChatCard } from "@/components/chat/section-chat-card";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { formatShortDate } from "@/lib/ui";
import { IconBiblioteca } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Recursos, type LibRow } from "./recursos";

export const dynamic = "force-dynamic";

// Categorías sugeridas en el alta (el equipo puede escribir otras).
const CATEGORIES = ["Música", "Logos", "Stock", "Plantillas", "Fuentes", "Marca", "NAS"];

export default async function BibliotecaPage() {
  // Acceso a la Biblioteca por permiso (el backfill se lo da al equipo; los clientes no).
  const session = await getSession();
  if (!hasPermission(session, "ver_biblioteca")) redirect("/");
  // Gestionar (añadir/editar/fijar) requiere permiso aparte; ver es suficiente para mirar.
  const canManage = hasPermission(session, "gestionar_biblioteca");

  const [assets, projects, clients] = await Promise.all([
    db.libraryAsset.findMany({
      orderBy: [{ pinned: "desc" }, { category: "asc" }, { createdAt: "desc" }],
      include: {
        uploadedBy: { select: { name: true } },
        project: { select: { name: true } },
        client: { select: { name: true } },
      },
    }),
    // Para el selector de vínculo: proyectos fuera de la papelera, alfabético.
    db.project.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.client.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows: LibRow[] = assets.map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    url: a.url,
    category: a.category,
    pinned: a.pinned,
    uploadedById: a.uploadedById,
    uploadedByName: a.uploadedBy?.name ?? null,
    createdAtLabel: formatShortDate(a.createdAt) ?? "",
    projectId: a.projectId,
    projectName: a.project?.name ?? null,
    clientId: a.clientId,
    clientName: a.client?.name ?? null,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconBiblioteca />}
        title="Biblioteca"
        description="Recursos del estudio: música, logos, plantillas, stock y rutas del NAS."
      />
      <div className="mt-3"><SectionChatCard section="biblioteca" /></div>

      <Recursos
        rows={rows}
        canManage={canManage}
        userId={session!.id}
        projects={projects}
        clients={clients}
        baseCategories={CATEGORIES}
      />
    </div>
  );
}
