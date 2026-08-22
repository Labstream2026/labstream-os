import { db } from "@/lib/db";
import { signFileToken } from "@/lib/storage";
import { signReviewToken } from "@/lib/review-token";
import { photoThumbSrc, photoDownloadSrc } from "@/lib/deliverable-photo";
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
  // Reproducción EN LÍNEA del máster final (solo video local del NAS): la galería del cliente lo
  // reproduce dentro del zoom, sin descargarlo. null para fotos y para piezas de Drive/enlace
  // (esas se abren aparte). Streaming con Range por /api/files-asset (mismo que la sala).
  play: string | null;
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

// Equipo a avisar de la actividad de la entrega: responsable + miembros SIN los usuarios de
// rol cliente — el invitado es quien descarga; avisarle «el cliente abrió su entrega» es ruido.
export async function deliveryTeamIds(projectId: string): Promise<string[]> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { leadId: true, members: { select: { userId: true } } },
  });
  if (!p) return [];
  const ids = Array.from(new Set([p.leadId, ...p.members.map((m) => m.userId)].filter((v): v is string => Boolean(v))));
  if (ids.length === 0) return [];
  const users = await db.user.findMany({
    where: { id: { in: ids }, active: true, role: { key: { not: "cliente" } } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

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
          select: { number: true, internalApprovedAt: true, fileUrl: true, fileAsset: { select: { id: true, deletedAt: true } } },
        },
        decisions: {
          where: { stage: "CLIENTE", result: "APROBADO" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
        renditions: { orderBy: { position: "asc" }, select: { id: true, format: true, label: true, url: true } },
        // Solo las 3 postales de la tarjeta (visibles); los CONTEOS reales van aparte por groupBy —
        // antes un take:200 hacía que un set de 800 mostrara «200 fotos».
        photos: { where: { excludedAt: null }, orderBy: { position: "asc" }, select: { fileAssetId: true, url: true }, take: 3 },
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

  // Conteos EXACTOS de los sets de fotos (lo que el cliente ve: sin excluidas), en una sola query.
  const fotoIds = deliverables.filter((d) => d.type === "FOTOGRAFIA").map((d) => d.id);
  const conteosFotos = fotoIds.length
    ? await db.deliverablePhoto.groupBy({
        by: ["deliverableId", "pick"],
        where: { deliverableId: { in: fotoIds }, excludedAt: null },
        _count: { _all: true },
      })
    : [];
  const fotosDe = (id: string) => {
    const filas = conteosFotos.filter((c) => c.deliverableId === id);
    return {
      total: filas.reduce((a, c) => a + c._count._all, 0),
      liked: filas.find((c) => c.pick === "ME_GUSTA")?._count._all ?? 0,
    };
  };

  const items: DeliveryItem[] = deliverables.map((d) => {
    const v = d.versions[0] ?? null;
    const download = v?.fileAsset && !v.fileAsset.deletedAt
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
    // Reproducción en línea: solo video local del NAS (no fotos, no Drive). Token de 24 h como
    // las fotos, para que abrir el zoom un rato después no caiga a 401 a media reproducción.
    const play = !isFotos && v?.fileAsset && !v.fileAsset.deletedAt
      ? `/api/files-asset/${v.fileAsset.id}?t=${signFileToken(v.fileAsset.id, 24 * 60 * 60)}`
      : null;
    return {
      id: d.id,
      name: d.name,
      number: d.number,
      type: d.type,
      typeLabel: DELIVERABLE_TYPE[d.type] ?? d.type,
      group: deliveryGroupOf(d.type),
      excluded: d.deliveryExcluded,
      // Miniatura 480 (cacheable 1 día): la tarjeta es pequeña y el WebP de 1600 con no-cache
      // era trabajo del NAS regalado en cada visita.
      cover: d.coverFileAssetId ? photoThumbSrc({ fileAssetId: d.coverFileAssetId, url: null }) : null,
      coverDownload,
      versionNumber: v?.number ?? null,
      approvedAt: d.decisions[0]?.createdAt ?? v?.internalApprovedAt ?? d.updatedAt,
      play,
      download,
      renditions: d.renditions.map((r) => ({ id: r.id, label: r.label || r.format, url: r.url })),
      photos: isFotos
        ? {
            count: fotosDe(d.id).total,
            liked: fotosDe(d.id).liked,
            thumbs: d.photos.map((p) => photoThumbSrc(p)),
            galleryUrl: `/review/${signReviewToken(d.id)}`,
          }
        : null,
    };
  });

  const covers: DeliveryCover[] = approvedCovers.map((c) => ({
    id: c.id,
    name: c.name,
    view: photoThumbSrc({ fileAssetId: c.fileAssetId, url: null }),
    download: photoDownloadSrc({ fileAssetId: c.fileAssetId, url: null }),
  }));

  const included = items.filter((i) => !i.excluded);
  const lastDeliveredAt = included.reduce<Date | null>(
    (acc, i) => (acc && acc > i.approvedAt ? acc : i.approvedAt),
    null,
  );

  return { items, covers, includedCount: included.length + covers.length, lastDeliveredAt };
}
