import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getDeliveryPackage } from "@/lib/delivery-data";
import { formatBogotaDate } from "@/lib/bogota-time";
import { tone } from "@/lib/colors";
import { emojiToText } from "@/components/icons/marks";
import { ClientPortalNav } from "@/components/client-portal-nav";
import { PageHeader } from "@/components/ui/page-header";
import { IconEntregas } from "@/components/icons";
import { FinalsHub, type HubProject } from "./finals-hub";

export const dynamic = "force-dynamic";

// ── Entregas finales 2.0 ──
// La biblioteca de descargas del invitado, agrupada POR PROYECTO: todo el material entregado
// de cada uno (videos con sus formatos, fotos y portadas) con su banner y color. Dos cambios
// deliberados frente a la versión anterior:
//   1. Muestra TODO el material entregado del proyecto, no solo las piezas donde el invitado
//      fue tagueado como revisor — esto es la ENTREGA final, no la revisión («Mis entregas»
//      conserva el filtro de revisor).
//   2. Los proyectos ARCHIVADOS no desaparecen: bajan a su propia sección plegada y el
//      material sigue descargable. Es la misma regla que la sala pública /entrega.
// Comparte consulta con la sala y el panel (getDeliveryPackage) → respeta deliveryExcluded.
export default async function EntregasFinalesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "cliente") redirect("/");

  // Sus proyectos por membresía, SIN el filtro de archivedAt de accessibleProjectWhere: aquí
  // el archivo no esconde la entrega (solo la purga definitiva, que borra la fila).
  const projects = await db.project.findMany({
    where: { OR: [{ leadId: session.id }, { members: { some: { userId: session.id } } }] },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      emoji: true,
      bannerUrl: true,
      archivedAt: true,
      finishedAt: true,
      client: { select: { accentColor: true, bannerUrl: true } },
    },
  });

  const packs = await Promise.all(projects.map((p) => getDeliveryPackage(p.id)));

  const hubProjects: HubProject[] = projects
    .map((p, idx) => {
      const pack = packs[idx];
      const items = pack.items.filter((i) => !i.excluded);
      return {
        id: p.id,
        name: p.name,
        emoji: emojiToText(p.emoji) || null,
        bannerUrl: p.bannerUrl ?? p.client?.bannerUrl ?? null,
        accentHex: p.client?.accentColor ? tone(p.client.accentColor).hex : null,
        archived: Boolean(p.archivedAt),
        finished: Boolean(p.finishedAt),
        deliveredLabel: pack.lastDeliveredAt
          ? `entregado el ${formatBogotaDate(pack.lastDeliveredAt, { day: "numeric", month: "long" })}`
          : null,
        items: items.map((i) => ({
          id: i.id,
          name: i.name,
          number: i.number,
          group: i.group,
          typeLabel: i.typeLabel,
          cover: i.cover,
          coverDownload: i.coverDownload,
          versionNumber: i.versionNumber,
          approvedLabel: `Aprobada · ${formatBogotaDate(i.approvedAt, { day: "numeric", month: "short" })}`,
          download: i.download,
          renditions: i.renditions,
          photos: i.photos,
        })),
        covers: pack.covers,
      };
    })
    .filter((p) => p.items.length > 0 || p.covers.length > 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <PageHeader
        icon={<IconEntregas />}
        title="Entregas finales"
        description="Todo tu material aprobado, proyecto por proyecto y listo para descargar. Siempre la versión final — y sigue aquí aunque el proyecto ya se haya cerrado."
      />

      <ClientPortalNav active="finales" />

      <FinalsHub projects={hubProjects} />
    </div>
  );
}
