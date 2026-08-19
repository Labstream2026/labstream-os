import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { formatBogota } from "@/lib/bogota-time";
import { WikiTabs } from "@/app/(app)/wiki/wiki-tabs";
import { IconTarjetas } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";
import { TemplatesList, type TemplateRow } from "./templates-list";

export const dynamic = "force-dynamic";

// ── Plantillas de DOCUMENTO de la empresa ──
// El guion técnico, el presupuesto, la propuesta con la marca: se suben (o se escriben) una
// vez y desde ahí arranca cualquier documento nuevo, en cualquier proyecto.
export default async function PlantillasDocumentosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "cliente") redirect("/inicio");

  const rows = await db.docTemplate.findMany({
    orderBy: [{ archivedAt: "asc" }, { usedCount: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, description: true, ext: true, size: true, usedCount: true,
      archivedAt: true, createdAt: true, createdBy: { select: { name: true } },
    },
  });
  const lista: TemplateRow[] = rows.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    ext: t.ext,
    size: t.size,
    usedCount: t.usedCount,
    archived: Boolean(t.archivedAt),
    author: t.createdBy?.name ?? null,
    when: formatBogota(t.createdAt, { day: "numeric", month: "short", year: "numeric" }),
  }));

  const canManage = session.role !== "demo" && hasPermission(session, "subir_archivos");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      {/* Antes decía «Wiki del equipo», que no es esta pantalla ni lo que dice la barra. */}
      <PageHeader icon={<IconTarjetas />} title="Plantillas de documento" description="El punto de partida de los guiones, presupuestos y propuestas." />
      <WikiTabs />

      <div className="mb-4">
        <h2 className="text-lg font-semibold">Plantillas de documento</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Al crear un documento en cualquier proyecto se puede empezar por una de estas. Crear desde una plantilla
          COPIA el archivo: el documento nuevo es independiente y editarlo nunca cambia la plantilla.
        </p>
      </div>

      <TemplatesList rows={lista} canManage={canManage} canDelete={session.role === "admin"} />
    </div>
  );
}
