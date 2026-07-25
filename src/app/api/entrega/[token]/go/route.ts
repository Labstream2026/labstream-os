import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parseDeliveryToken } from "@/lib/delivery-token";
import { DELIVERY_STATUSES } from "@/lib/delivery-data";
import { signFileToken } from "@/lib/storage";
import { signReviewToken } from "@/lib/review-token";
import { photoDownloadSrc } from "@/lib/deliverable-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Redirección de DESCARGA de la sala pública /entrega: valida el token y el ALCANCE (la pieza
// pertenece a ese proyecto, está aprobada/entregada y no fue excluida del paquete), registra el
// evento y recién entonces redirige al archivo real (Drive, enlace externo o archivo del NAS con
// token firmado). El destino SIEMPRE se resuelve desde la BD — nunca desde parámetros de la URL —
// así el endpoint no sirve de redirector abierto. Gracias a este salto sabemos si el cliente ya
// bajó su material antes de que el enlace expire.
//
// k = master  · id = deliverableId  → versión final (archivo NAS o enlace externo)
// k = rend    · id = renditionId    → formato publicado (IG/TikTok/…)
// k = cover   · id = projectCoverId → portada aprobada del banco
// k = itemcover · id = deliverableId → portada del video (banco si hay, si no la subida)
// k = fotos   · id = deliverableId  → galería del set de fotos (su sala de revisión)

const INCLUDED = { deliveryExcluded: false, status: { in: [...DELIVERY_STATUSES] } };

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = parseDeliveryToken(token);
  if (!parsed) return new NextResponse("Enlace inválido", { status: 401 });

  const project = await db.project.findUnique({
    where: { id: parsed.projectId },
    select: { deliveryNonce: true, deliveryRevokedAt: true, deliveryExpiresAt: true },
  });
  // A propósito NO se comprueba archivedAt: la entrega sobrevive al archivo del proyecto.
  const badNonce = !project?.deliveryNonce || project.deliveryNonce !== parsed.nonce;
  const expired = project?.deliveryExpiresAt ? project.deliveryExpiresAt.getTime() < Date.now() : false;
  if (!project || badNonce || project.deliveryRevokedAt || expired) {
    return new NextResponse("Enlace no disponible", { status: 401 });
  }

  const k = req.nextUrl.searchParams.get("k") ?? "";
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return new NextResponse("Falta la pieza", { status: 400 });

  const projectId = parsed.projectId;
  let target: string | null = null;
  let label: string | null = null;

  if (k === "master") {
    const d = await db.deliverable.findFirst({
      where: { id, projectId, ...INCLUDED },
      select: {
        name: true,
        number: true,
        versions: {
          where: { internalApproved: true },
          orderBy: { number: "desc" },
          take: 1,
          select: { fileUrl: true, fileAssetId: true },
        },
      },
    });
    const v = d?.versions[0];
    if (d && v) {
      target = v.fileAssetId ? `/api/files-asset/${v.fileAssetId}?t=${signFileToken(v.fileAssetId)}&download=1` : v.fileUrl;
      label = `${d.number ? `#${d.number} ` : ""}${d.name} · versión final`;
    }
  } else if (k === "rend") {
    const r = await db.deliverableRendition.findFirst({
      where: { id, deliverable: { projectId, ...INCLUDED } },
      select: { url: true, label: true, format: true, deliverable: { select: { name: true, number: true } } },
    });
    if (r) {
      target = r.url;
      label = `${r.deliverable.number ? `#${r.deliverable.number} ` : ""}${r.deliverable.name} · ${r.label || r.format}`;
    }
  } else if (k === "cover") {
    const c = await db.projectCover.findFirst({
      where: { id, projectId, decision: "APROBADA" },
      select: { name: true, fileAssetId: true },
    });
    if (c) {
      target = photoDownloadSrc({ fileAssetId: c.fileAssetId, url: null });
      label = `Portada · ${c.name}`;
    }
  } else if (k === "itemcover") {
    const d = await db.deliverable.findFirst({
      where: { id, projectId, ...INCLUDED },
      select: { name: true, number: true, coverFileAssetId: true },
    });
    if (d) {
      const bank = await db.projectCover.findFirst({
        where: { deliverableId: id, projectId, decision: "APROBADA" },
        select: { fileAssetId: true },
      });
      const assetId = bank?.fileAssetId ?? d.coverFileAssetId;
      if (assetId) {
        target = photoDownloadSrc({ fileAssetId: assetId, url: null });
        label = `${d.number ? `#${d.number} ` : ""}${d.name} · portada`;
      }
    }
  } else if (k === "fotos") {
    const d = await db.deliverable.findFirst({
      where: { id, projectId, type: "FOTOGRAFIA", ...INCLUDED },
      select: { name: true, photos: { select: { id: true }, take: 1 } },
    });
    if (d) {
      target = `/review/${signReviewToken(id)}`;
      label = `Set de fotos · ${d.name} (abrir galería)`;
    }
  } else {
    return new NextResponse("Tipo de pieza desconocido", { status: 400 });
  }

  if (!target) return new NextResponse("Pieza no disponible en esta entrega", { status: 404 });

  await db.deliveryEvent
    .create({ data: { projectId, kind: "DOWNLOAD", label } })
    .catch(() => {}); // registrar nunca debe romper la descarga

  return NextResponse.redirect(new URL(target, req.nextUrl.origin), 302);
}
