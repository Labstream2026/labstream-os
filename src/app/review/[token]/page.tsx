import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyReviewToken } from "@/lib/review-token";
import { signFileToken } from "@/lib/storage";
import { deliverableStatusMeta } from "@/lib/ui";
import { detectSource } from "@/lib/media-source";
import { ReviewClient, type ReviewVersion } from "./review-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMG = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
const VID = /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i;

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deliverableId = verifyReviewToken(token);
  if (!deliverableId) notFound();

  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    include: {
      project: { select: { name: true, emoji: true, client: { select: { name: true } } } },
      versions: { orderBy: { number: "desc" }, include: { fileAsset: { select: { id: true, name: true } } } },
      reviewComments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!deliverable) notFound();

  // Enlace revocado: estado inválido (no se muestra el material).
  if (deliverable.reviewRevokedAt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-xl font-bold">Enlace no disponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">Este enlace de revisión fue revocado por el equipo. Pide uno nuevo a tu productor.</p>
        </div>
      </div>
    );
  }

  // Cuenta una visita (no bloquea el render si falla).
  await db.deliverable.update({ where: { id: deliverableId }, data: { reviewVisits: { increment: 1 } } }).catch(() => {});

  // Compuerta bloqueante: el cliente solo ve versiones aprobadas internamente.
  const approved = deliverable.versions.filter((v) => v.internalApproved);
  const meta = deliverableStatusMeta(deliverable.status);

  const versions: ReviewVersion[] = approved.map((v) => {
    if (v.fileAsset) {
      const url = `/api/files-asset/${v.fileAsset.id}?t=${signFileToken(v.fileAsset.id)}`;
      const name = v.fileAsset.name;
      const kind = IMG.test(name) ? "image" : VID.test(name) ? "video" : "other";
      return { number: v.number, notes: v.notes, kind, src: url, openUrl: url, fileName: name, timecodeCapable: kind === "video" };
    }
    const s = detectSource(v.fileUrl);
    if (!s) return { number: v.number, notes: v.notes, kind: "none", src: null, openUrl: null, fileName: null, timecodeCapable: false };
    const kindMap: Record<string, ReviewVersion["kind"]> = {
      YOUTUBE: "youtube", VIMEO: "vimeo", DRIVE_FILE: "drive_file", DRIVE_FOLDER: "drive_folder", MP4: "video", IMAGE: "image", OTHER: "other",
    };
    return {
      number: v.number,
      notes: v.notes,
      kind: kindMap[s.type] ?? "other",
      src: s.embedUrl ?? s.url,
      openUrl: s.url,
      fileName: null,
      timecodeCapable: s.timecodeCapable,
    };
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">L</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{deliverable.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {deliverable.project.emoji} {deliverable.project.name}
              {deliverable.project.client ? ` · ${deliverable.project.client.name}` : ""}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-bold tracking-tight">Revisión del cliente</h1>
          <p className="text-sm text-muted-foreground">Revisa el material, deja comentarios y aprueba o solicita cambios.</p>
        </div>

        {versions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            El material aún está en revisión interna del equipo. En cuanto esté listo, lo verás aquí.
          </div>
        ) : (
          <ReviewClient
            token={token}
            versions={versions}
            status={deliverable.status}
            allowDrawings={deliverable.reviewAllowDrawings}
            comments={deliverable.reviewComments.map((c) => ({
              id: c.id,
              authorName: c.authorName,
              body: c.body,
              timecode: c.timecode,
              versionNumber: c.versionNumber,
              drawing: (c.drawingData as { image?: string } | null) ?? null,
              fromClient: c.fromClient,
              createdAt: c.createdAt.toISOString(),
            }))}
          />
        )}
      </main>
    </div>
  );
}
