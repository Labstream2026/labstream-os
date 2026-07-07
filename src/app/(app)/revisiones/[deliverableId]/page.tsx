import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject, canManageProject } from "@/lib/project-access";
import { signReviewToken } from "@/lib/review-token";
import { buildStageVersions } from "@/lib/review-version";
import { deliverableStatusMeta, deliverableOrientation } from "@/lib/ui";
import { ReviewLinkBar } from "@/app/(app)/proyectos/[id]/deliverable-review";
import { InternalReview } from "./internal-review";
import type { StageComment } from "@/components/review/review-stage";
import { EntityEmoji } from "@/components/icons/marks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REVIEW_BASE = process.env.NEXTAUTH_URL || "";

export default async function InternalReviewPage({ params }: { params: Promise<{ deliverableId: string }> }) {
  const { deliverableId } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  // Espacio de revisión INTERNA del equipo: el portal del cliente no entra (vería versiones sin
  // pre-aprobar y comentarios internos). Su vista de entregables está en /proyectos/[id].
  if (session.role === "cliente") redirect("/proyectos");

  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    include: {
      project: { select: { id: true, name: true, emoji: true, isPrivate: true, leadId: true, members: { select: { userId: true, role: true } }, client: { select: { name: true } } } },
      reviewers: { select: { userId: true } },
      versions: { orderBy: { number: "desc" }, include: { fileAsset: { select: { id: true, name: true } } } },
      reviewComments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!deliverable) notFound();
  if (!canAccessProject(deliverable.project, session)) notFound();

  const canManage = canManageProject(deliverable.project, session);
  // Puede pre-aprobar el responsable del proyecto/admin O CUALQUIER co-revisor asignado.
  const canDecide = canManage || deliverable.reviewers.some((r) => r.userId === session.id) || deliverable.reviewerId === session.id;
  const meta = deliverableStatusMeta(deliverable.status);

  // El equipo ve TODAS las versiones (incluidas las pendientes de pre-aprobación).
  const versions = await buildStageVersions(deliverable.versions);

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
    locked: c.lockedAt != null,
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
              <EntityEmoji value={deliverable.project.emoji} /> {deliverable.project.name}
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
            canDecide={canDecide}
            orientation={deliverableOrientation(deliverable.type)}
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
