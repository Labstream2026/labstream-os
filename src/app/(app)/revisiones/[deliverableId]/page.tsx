import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject, canManageProject } from "@/lib/project-access";
import { signFileToken } from "@/lib/storage";
import { signReviewToken, signReviewMediaToken } from "@/lib/review-token";
import { detectSource } from "@/lib/media-source";
import { deliverableStatusMeta } from "@/lib/ui";
import { ReviewLinkBar } from "@/app/(app)/proyectos/[id]/deliverable-review";
import { InternalReview } from "./internal-review";
import type { StageVersion, StageComment } from "@/components/review/review-stage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REVIEW_BASE = process.env.NEXTAUTH_URL || "";
const IMG = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i;
const VID = /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i;

export default async function InternalReviewPage({ params }: { params: Promise<{ deliverableId: string }> }) {
  const { deliverableId } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    include: {
      project: { select: { id: true, name: true, emoji: true, isPrivate: true, leadId: true, members: { select: { userId: true, role: true } }, client: { select: { name: true } } } },
      versions: { orderBy: { number: "desc" }, include: { fileAsset: { select: { id: true, name: true } } } },
      reviewComments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!deliverable) notFound();
  if (!canAccessProject(deliverable.project, session)) notFound();

  const canManage = canManageProject(deliverable.project, session);
  const meta = deliverableStatusMeta(deliverable.status);

  // El equipo ve TODAS las versiones (incluidas las pendientes de pre-aprobación).
  const versions: StageVersion[] = deliverable.versions.map((v) => {
    if (v.fileAsset) {
      const url = `/api/files-asset/${v.fileAsset.id}?t=${signFileToken(v.fileAsset.id)}`;
      const name = v.fileAsset.name;
      const kind = IMG.test(name) ? "image" : VID.test(name) ? "video" : "other";
      return { number: v.number, notes: v.notes, kind, src: url, openUrl: url, fileName: name, timecodeCapable: kind === "video" };
    }
    const s = detectSource(v.fileUrl);
    if (!s) return { number: v.number, notes: v.notes, kind: "none", src: null, openUrl: null, fileName: null, timecodeCapable: false };
    const kindMap: Record<string, StageVersion["kind"]> = {
      YOUTUBE: "youtube", VIMEO: "vimeo", DRIVE_FILE: "drive_file", DRIVE_FOLDER: "drive_folder", MP4: "video", IMAGE: "image", OTHER: "other",
    };
    const kind = kindMap[s.type] ?? "other";
    // Drive: además del iframe, ofrecemos el video proxiado (mismo origen) para capturar.
    const proxySrc = s.type === "DRIVE_FILE" ? `/api/review-media/${v.id}?t=${signReviewMediaToken(v.id)}` : null;
    return {
      number: v.number,
      notes: v.notes,
      kind,
      src: s.embedUrl ?? s.url,
      proxySrc,
      openUrl: s.url,
      fileName: null,
      timecodeCapable: s.timecodeCapable || kind === "drive_file", // con proxy, Drive es capaz de timecode
    };
  });

  const comments: StageComment[] = deliverable.reviewComments.map((c) => ({
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
  }));

  const hasApproved = deliverable.versions.some((v) => v.internalApproved);
  const reviewUrl = `${REVIEW_BASE}/review/${signReviewToken(deliverable.id)}`;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-4">
        <Link href="/revisiones" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Proyectos a revisar
        </Link>
      </div>

      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">{deliverable.name}</h1>
          <p className="text-sm text-muted-foreground">
            <Link href={`/proyectos/${deliverable.project.id}?tab=entregables`} className="hover:underline">
              {deliverable.project.emoji} {deliverable.project.name}
            </Link>
            {deliverable.project.client ? ` · ${deliverable.project.client.name}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
      </header>

      {versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Este entregable aún no tiene versiones. El equipo debe subir una desde el proyecto.
        </div>
      ) : (
        <>
          {!canManage ? (
            <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Puedes comentar y anotar, pero la pre-aprobación la decide el responsable del proyecto.
            </p>
          ) : null}
          <InternalReview
            deliverableId={deliverable.id}
            projectId={deliverable.project.id}
            versions={versions}
            comments={comments}
            status={deliverable.status}
            meName={session.name}
            canDecide={canManage}
          />

          {/* Enlace para el cliente (revocar / modo dibujos del portal) */}
          {canManage ? (
            <div className="mt-6 rounded-xl border border-border bg-card p-4">
              <ReviewLinkBar
                deliverableId={deliverable.id}
                projectId={deliverable.project.id}
                url={reviewUrl}
                visits={deliverable.reviewVisits}
                revoked={Boolean(deliverable.reviewRevokedAt)}
                allowDrawings={deliverable.reviewAllowDrawings}
                hasApproved={hasApproved}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
