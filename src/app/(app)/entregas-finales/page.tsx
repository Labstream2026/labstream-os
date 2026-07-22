import { redirect } from "next/navigation";
import { FolderCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { signFileToken } from "@/lib/storage";
import { photoViewSrc } from "@/lib/deliverable-photo";
import { formatBogotaDate } from "@/lib/bogota-time";
import { DELIVERABLE_TYPE } from "@/lib/ui";
import { ClientPortalNav } from "@/components/client-portal-nav";
import { FinalsGallery, type FinalItem } from "./gallery";

export const dynamic = "force-dynamic";

// ── Entregas finales ──
// La biblioteca de marca del cliente: TODO lo aprobado/entregado de todos sus proyectos en una
// sola grilla, con miniatura, versión final y descarga. Solo versiones con aprobación interna
// (las «finales»); nunca borradores.
export default async function EntregasFinalesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "cliente") redirect("/");

  // Sus proyectos (por membresía) → luego las piezas aprobadas donde está tagueado como revisor.
  const projects = await db.project.findMany({
    where: accessibleProjectWhere(session),
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);

  const deliverables = projectIds.length
    ? await db.deliverable.findMany({
        where: {
          projectId: { in: projectIds },
          status: { in: ["APROBADO", "ENTREGADO"] },
          OR: [{ reviewers: { some: { userId: session.id } } }, { reviewerId: session.id }],
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
          updatedAt: true,
          coverFileAssetId: true,
          project: { select: { id: true, name: true, emoji: true } },
          versions: {
            where: { internalApproved: true },
            orderBy: { number: "desc" },
            take: 1,
            select: { number: true, internalApprovedAt: true, fileUrl: true, fileAsset: { select: { id: true, name: true } } },
          },
          decisions: {
            where: { stage: "CLIENTE", result: "APROBADO" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
          renditions: { orderBy: { position: "asc" }, select: { id: true, format: true, label: true, url: true } },
        },
      })
    : [];

  const items: FinalItem[] = deliverables.map((d) => {
    const v = d.versions[0] ?? null;
    // Descarga de la versión final: archivo local (con token firmado + descarga directa) o enlace externo.
    const download = v?.fileAsset
      ? { href: `/api/files-asset/${v.fileAsset.id}?t=${signFileToken(v.fileAsset.id)}&download=1`, external: false }
      : v?.fileUrl
        ? { href: v.fileUrl, external: true }
        : null;
    const approvedAt = d.decisions[0]?.createdAt ?? v?.internalApprovedAt ?? d.updatedAt;
    return {
      id: d.id,
      name: d.name,
      typeLabel: DELIVERABLE_TYPE[d.type] ?? d.type,
      projectId: d.project.id,
      projectName: d.project.name,
      cover: d.coverFileAssetId ? photoViewSrc({ fileAssetId: d.coverFileAssetId, url: null }) : null,
      versionNumber: v?.number ?? null,
      approvedLabel: `Aprobada · ${formatBogotaDate(approvedAt, { day: "numeric", month: "short" })}`,
      download,
      renditions: d.renditions.map((r) => ({ id: r.id, label: r.label || r.format, url: r.url })),
    };
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <FolderCheck className="size-6 text-primary" /> Entregas finales
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todo tu material aprobado, en un solo lugar y listo para descargar. Siempre la versión final — cero dudas de cuál usar.
        </p>
      </header>

      <ClientPortalNav active="finales" />

      <FinalsGallery items={items} />
    </div>
  );
}
