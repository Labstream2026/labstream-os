import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { verifyReviewToken } from "@/lib/review-token";
import { deliverableStatusMeta, deliverableOrientation } from "@/lib/ui";
import { buildStageVersions } from "@/lib/review-version";
import { photoViewSrc } from "@/lib/deliverable-photo";
import { PublicLinkInvalid } from "@/components/public-link-invalid";
import { Logo } from "@/components/brand/logo";
import { ReviewClient } from "./review-client";
import { PhotoGallery } from "./photo-gallery";

// Estado con la voz del cliente (no la etiqueta interna del equipo) para la cabecera de la sala.
const CLIENT_STATUS: Record<string, { label: string; className: string }> = {
  ENVIADO_CLIENTE: { label: "Para tu revisión", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  CORRECCIONES: { label: "Cambios enviados", className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300" },
  APROBADO: { label: "Aprobado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  ENTREGADO: { label: "Entregado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deliverableId = verifyReviewToken(token);
  if (!deliverableId) return <PublicLinkInvalid />;

  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    include: {
      project: { select: { name: true, emoji: true, client: { select: { name: true } } } },
      versions: { orderBy: { number: "desc" }, include: { fileAsset: { select: { id: true, name: true } } } },
      // El portal del cliente SOLO carga los comentarios del cliente (fromClient). Los
      // comentarios INTERNOS del equipo (pre-aprobación, fromClient=false) nunca salen del
      // servidor por este enlace público. La bandeja interna /revisiones los muestra todos.
      reviewComments: { where: { fromClient: true }, orderBy: { createdAt: "asc" } },
      photos: { orderBy: { position: "asc" } },
    },
  });
  if (!deliverable) return <PublicLinkInvalid />;

  // Enlace revocado o caducado: estado inválido (no se muestra el material).
  const expired = deliverable.reviewExpiresAt ? deliverable.reviewExpiresAt.getTime() < Date.now() : false;
  if (deliverable.reviewRevokedAt || expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-xl font-bold">Enlace no disponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {expired ? "Este enlace de revisión ha caducado. Pide uno nuevo a tu productor." : "Este enlace de revisión fue revocado por el equipo. Pide uno nuevo a tu productor."}
          </p>
        </div>
      </div>
    );
  }

  // Cuenta una visita (no bloquea el render si falla).
  await db.deliverable.update({ where: { id: deliverableId }, data: { reviewVisits: { increment: 1 } } }).catch(() => {});

  // Compuerta bloqueante: el cliente solo ve versiones aprobadas internamente.
  const approved = deliverable.versions.filter((v) => v.internalApproved);
  const meta = deliverableStatusMeta(deliverable.status);
  const statusPill = CLIENT_STATUS[deliverable.status] ?? meta;
  // Si quien visita tiene sesión de cliente (usuario invitado de la app), le ofrecemos volver a
  // su sala y le evitamos el paso de "¿cómo te llamas?" (ya sabemos quién es).
  const session = await getSession();
  const backHref = session?.role === "cliente" ? "/mis-entregas" : null;
  const sessionName = session?.role === "cliente" ? session.name : null;

  const versions = await buildStageVersions(approved);
  // Enlace de descarga al aprobar: la fuente de la última versión aprobada (Drive o archivo).
  const downloadUrl = versions[0]?.openUrl ?? null;

  // Entregable de FOTOGRAFIA: en vez del reproductor, una galería de selección. Las URLs de
  // visualización se calculan en el servidor (token de archivo para las locales, Drive para enlaces).
  const isPhoto = deliverable.type === "FOTOGRAFIA";
  const photos = deliverable.photos.map((p) => ({ id: p.id, filename: p.filename, src: photoViewSrc(p), pick: p.pick, clientNote: p.clientNote }));
  // La PORTADA es propia de los reels (vertical): la aprueba el cliente. En videos horizontales no aplica.
  const isReel = deliverableOrientation(deliverable.type) === "vertical";
  const coverSrc = isReel && deliverable.coverFileAssetId ? photoViewSrc({ fileAssetId: deliverable.coverFileAssetId, url: null }) : null;
  // Estado de la decisión de portada, atado al archivo actual (una portada nueva vuelve a "pendiente").
  const coverDecided = coverSrc && deliverable.coverDecisionFor && deliverable.coverDecisionFor === deliverable.coverFileAssetId;
  const coverStatus = !coverSrc ? null : coverDecided ? (deliverable.coverDecision === "APROBADA" ? "APROBADA" : "CAMBIOS") : "PENDIENTE";
  const coverDecisionBy = coverDecided ? deliverable.coverDecisionBy : null;
  const coverDecisionNote = coverDecided && deliverable.coverDecision === "CAMBIOS" ? deliverable.coverDecisionNote : null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3.5">
          {backHref ? (
            <Link
              href={backHref}
              title="Volver a tus entregas"
              aria-label="Volver a tus entregas"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
          ) : null}
          <Logo className="h-6" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{deliverable.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {deliverable.project.emoji} {deliverable.project.name}
              {deliverable.project.client ? ` · ${deliverable.project.client.name}` : ""}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusPill.className}`}>{statusPill.label}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold tracking-tight">Revisión del cliente</h1>
          <p className="text-sm text-muted-foreground">
            {isPhoto ? "Elige las fotos que te gustan y descarta las que no. Puedes dejar un comentario en cada una." : "Revisa el material, deja comentarios y aprueba o solicita cambios."}
          </p>
        </div>

        {isPhoto ? (
          photos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Aún no hay fotos para revisar. En cuanto el equipo las suba, las verás aquí para elegir.
            </div>
          ) : (
            <PhotoGallery token={token} photos={photos} />
          )
        ) : versions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            El material aún está en revisión interna del equipo. En cuanto esté listo, lo verás aquí.
          </div>
        ) : (
          <ReviewClient
            token={token}
            versions={versions}
            status={deliverable.status}
            allowDrawings
            orientation={deliverableOrientation(deliverable.type)}
            deliverableName={deliverable.name}
            projectName={deliverable.project.name}
            projectEmoji={deliverable.project.emoji}
            clientName={deliverable.project.client?.name ?? null}
            sessionName={sessionName}
            copy={deliverable.copy}
            hashtags={deliverable.hashtags}
            coverSrc={coverSrc}
            coverStatus={coverStatus}
            coverDecisionBy={coverDecisionBy}
            coverDecisionNote={coverDecisionNote}
            downloadUrl={downloadUrl}
            comments={deliverable.reviewComments.map((c) => ({
              id: c.id,
              authorName: c.authorName,
              body: c.body,
              timecode: c.timecode,
              versionNumber: c.versionNumber,
              drawing: (c.drawingData as { image?: string } | null) ?? null,
              isNote: c.isNote,
              fromClient: c.fromClient,
              resolved: c.resolved,
              createdAt: c.createdAt.toISOString(),
            }))}
          />
        )}
      </main>
    </div>
  );
}
