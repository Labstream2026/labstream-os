import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Camera } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessProject, canManageProject, canWriteProject } from "@/lib/project-access";
import { signReviewToken } from "@/lib/review-token";
import { deliverableStatusMeta } from "@/lib/ui";
import { photoThumbSrc, photoDownloadSrc } from "@/lib/deliverable-photo";
import { opsEnabled } from "@/lib/nas-ops";
import { isEmailEnabled } from "@/lib/email";
import { toWhatsappNumber } from "@/lib/whatsapp/send";
import { textoWhatsapp } from "@/lib/review-share";
import { EntityEmoji } from "@/components/icons/marks";
import { SetStudio, type FotoStudio } from "./set-studio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REVIEW_BASE = process.env.NEXTAUTH_URL || "";

// Estados en los que el enlace del cliente abre la galería (la compuerta de la sala).
const DE_CARA_AL_CLIENTE = new Set(["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"]);

// ── El estudio de un set de fotos (equipo) ──
// La trastienda de la galería: subir la carpeta de la sesión, curar qué pasa al cliente,
// mandarla (a revisión interna o directo) y leer la selección que volvió.
export default async function SetFotosPage({ params }: { params: Promise<{ id: string; setId: string }> }) {
  const { id: projectId, setId } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  // El estudio es del equipo; el cliente tiene su galería en /review/[token] (o el portal).
  if (session.role === "cliente") redirect("/proyectos");

  const set = await db.deliverable.findUnique({
    where: { id: setId },
    include: {
      project: {
        select: {
          id: true, name: true, emoji: true, isPrivate: true, leadId: true,
          members: { select: { userId: true, role: true } },
          archivedAt: true, finishedAt: true,
          // La carpeta del PROYECTO en el disco: punto de partida sugerido del selector del set.
          opsFolder: true,
          client: { select: { name: true, phone: true } },
        },
      },
      photos: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { fileAsset: { select: { kind: true } } } },
    },
  });
  if (!set || set.type !== "FOTOGRAFIA" || set.projectId !== projectId) notFound();
  if (!canAccessProject(set.project, session)) notFound();

  const canManage = canManageProject(set.project, session);
  const canUpload = canWriteProject(set.project, session) && hasPermission(session, "subir_archivos");
  const meta = deliverableStatusMeta(set.status);
  const linkAbierto = DE_CARA_AL_CLIENTE.has(set.status);
  const reviewUrl = `${REVIEW_BASE}/review/${signReviewToken(setId)}`;

  const fotos: FotoStudio[] = set.photos.map((p) => ({
    id: p.id,
    filename: p.filename,
    src: photoThumbSrc(p),
    fullSrc: photoDownloadSrc(p),
    seccion: p.section,
    // Proporción para la cuadrícula justificada; sin dimensiones (fotos viejas o de Drive), 3:2.
    ar: p.width && p.height ? Math.min(2.8, Math.max(0.4, p.width / p.height)) : 1.5,
    excluida: !!p.excludedAt,
    pick: p.pick,
    note: p.clientNote,
    esPortada: !!p.fileAssetId && p.fileAssetId === set.coverFileAssetId,
    // OPS: el original vive en Operaciones_LAB — borrarla del set no toca el disco.
    esOps: p.fileAsset?.kind === "OPS",
  }));
  const nextPos = (set.photos.at(-1)?.position ?? -1) + 1;

  // WhatsApp personal: mismo texto que armaría el envío normal (lib/review-share).
  const phone = set.project.client?.phone ? toWhatsappNumber(set.project.client.phone) : null;
  const wa =
    linkAbierto && phone
      ? {
          phone,
          href: `https://wa.me/${phone}?text=${encodeURIComponent(
            textoWhatsapp([{ titulo: `${set.number ? `#${set.number} ` : ""}${set.name}`, proyecto: set.project.name, url: reviewUrl }], ""),
          )}`,
        }
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <header className="flex items-center gap-3">
        <Link
          href={`/proyectos/${projectId}`}
          title="Volver al proyecto"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <Camera className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">
            {set.number ? <span className="mr-1.5 text-muted-foreground">#{set.number}</span> : null}
            {set.name}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            <EntityEmoji value={set.project.emoji} /> {set.project.name}
            {set.project.client ? ` · ${set.project.client.name}` : ""}
          </p>
        </div>
      </header>

      <SetStudio
        setId={setId}
        fotos={fotos}
        nextPos={nextPos}
        canUpload={canUpload}
        canManage={canManage}
        statusLabel={meta.label}
        statusClass={meta.className}
        linkAbierto={linkAbierto}
        enRevision={set.status === "REVISION_INTERNA"}
        reviewUrl={reviewUrl}
        emailEnabled={await isEmailEnabled()}
        wa={wa}
        opsHabilitado={opsEnabled()}
        carpetaOps={set.photosOpsFolder}
        carpetaInicio={set.project.opsFolder}
      />
    </div>
  );
}
