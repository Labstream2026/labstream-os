import { db } from "@/lib/db";
import { signFileToken } from "@/lib/storage";
import { signReviewToken } from "@/lib/review-token";
import { photoViewSrc, photoDownloadSrc } from "@/lib/deliverable-photo";
import { DELIVERABLE_TYPE } from "@/lib/ui";
import { deliveryGroupOf, type DeliveryGroupKey } from "@/lib/delivery-groups";

// ── Paquete de entrega del proyecto ──
// La MISMA consulta alimenta las tres superficies: la sala pública /entrega/[token], la página
// «Entregas finales» del portal del invitado y el panel «Paquete de entrega» del equipo. Qué
// entra: piezas APROBADAS/ENTREGADAS con su versión final (aprobación interna), formatos,
// sets de fotos y portadas aprobadas del banco. Nunca borradores ni piezas en corrección.
// `deliveryExcluded` saca la excepción (el checklist del equipo).

export const DELIVERY_STATUSES = ["APROBADO", "ENTREGADO"] as const;

export type DeliveryRendition = { id: string; label: string; url: string };

export type DeliveryItem = {
  id: string;
  name: string;
  number: number | null;
  type: string;
  typeLabel: string;
  group: DeliveryGroupKey;
  excluded: boolean;
  cover: string | null; // miniatura para <img> (token firmado o thumbnail de Drive)
  coverDownload: string | null; // portada aprobada descargable (directa, para superficies con sesión)
  versionNumber: number | null;
  approvedAt: Date;
  // Descarga DIRECTA del máster (portal con sesión). La sala pública no usa estos href:
  // pasa por /api/entrega/[token]/go para registrar la descarga y validar el alcance.
  download: { href: string; external: boolean } | null;
  renditions: DeliveryRendition[];
  // Solo FOTOGRAFIA: la galería completa vive en su sala de revisión (ver + elegir + descargar).
  photos: { count: number; liked: number; thumbs: string[]; galleryUrl: string } | null;
};

export type DeliveryCover = { id: string; name: string; view: string; download: string };

export type DeliveryPackage = {
  // TODAS las piezas elegibles, con su flag `excluded` — cada superficie filtra: la sala y el
  // portal esconden las excluidas; el panel del equipo las muestra para poder re-incluirlas.
  items: DeliveryItem[];
  covers: DeliveryCover[]; // banco de portadas aprobadas del proyecto
  includedCount: number; // piezas incluidas + portadas: el «N archivos» de la sala
  lastDeliveredAt: Date | null;
};

export async function getDeliveryPackage(projectId: string): Promise<DeliveryPackage> {
  const [deliverables, approvedCovers] = await Promise.all([
    db.deliverable.findMany({
      where: { projectId, status: { in: [...DELIVERY_STATUSES] } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        number: true,
        type: true,
        updatedAt: true,
        deliveryExcluded: true,
        coverFileAssetId: true,
        versions: {
          where: { internalApproved: true },
          orderBy: { number: "desc" },
          take: 1,
          select: { number: true, internalApprovedAt: true, fileUrl: true, fileAsset: { select: { id: true } } },
        },
        decisions: {
          where: { stage: "CLIENTE", result: "APROBADO" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
        renditions: { orderBy: { position: "asc" }, select: { id: true, format: true, label: true, url: true } },
        photos: { orderBy: { position: "asc" }, select: { fileAssetId: true, url: true, pick: true }, take: 200 },
      },
    }),
    db.projectCover.findMany({
      where: { projectId, decision: "APROBADA" },
      orderBy: { decisionAt: "desc" },
      select: { id: true, name: true, fileAssetId: true, deliverableId: true },
    }),
  ]);

  const coverByDeliverable = new Map(
    approvedCovers.filter((c) => c.deliverableId).map((c) => [c.deliverableId as string, c]),
  );

  const items: DeliveryItem[] = deliverables.map((d) => {
    const v = d.versions[0] ?? null;
    const download = v?.fileAsset
      ? { href: `/api/files-asset/${v.fileAsset.id}?t=${signFileToken(v.fileAsset.id)}&download=1`, external: false }
      : v?.fileUrl
        ? { href: v.fileUrl, external: true }
        : null;
    const bank = coverByDeliverable.get(d.id);
    const coverDownload = bank
      ? photoDownloadSrc({ fileAssetId: bank.fileAssetId, url: null })
      : d.coverFileAssetId
        ? photoDownloadSrc({ fileAssetId: d.coverFileAssetId, url: null })
        : null;
    const isFotos = d.type === "FOTOGRAFIA";
    return {
      id: d.id,
      name: d.name,
      number: d.number,
      type: d.type,
      typeLabel: DELIVERABLE_TYPE[d.type] ?? d.type,
      group: deliveryGroupOf(d.type),
      excluded: d.deliveryExcluded,
      cover: d.coverFileAssetId ? photoViewSrc({ fileAssetId: d.coverFileAssetId, url: null }) : null,
      coverDownload,
      versionNumber: v?.number ?? null,
      approvedAt: d.decisions[0]?.createdAt ?? v?.internalApprovedAt ?? d.updatedAt,
      download,
      renditions: d.renditions.map((r) => ({ id: r.id, label: r.label || r.format, url: r.url })),
      photos: isFotos
        ? {
            count: d.photos.length,
            liked: d.photos.filter((p) => p.pick === "ME_GUSTA").length,
            thumbs: d.photos.slice(0, 3).map((p) => photoViewSrc(p, 400)),
            galleryUrl: `/review/${signReviewToken(d.id)}`,
          }
        : null,
    };
  });

  const covers: DeliveryCover[] = approvedCovers.map((c) => ({
    id: c.id,
    name: c.name,
    view: photoViewSrc({ fileAssetId: c.fileAssetId, url: null }, 600),
    download: photoDownloadSrc({ fileAssetId: c.fileAssetId, url: null }),
  }));

  const included = items.filter((i) => !i.excluded);
  const lastDeliveredAt = included.reduce<Date | null>(
    (acc, i) => (acc && acc > i.approvedAt ? acc : i.approvedAt),
    null,
  );

  return { items, covers, includedCount: included.length + covers.length, lastDeliveredAt };
}
