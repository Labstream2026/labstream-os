import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { verifyReviewToken } from "@/lib/review-token";
import { deliverableStatusMeta } from "@/lib/ui";
import { ReviewClient } from "./review-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deliverableId = verifyReviewToken(token);
  if (!deliverableId) notFound();

  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    include: {
      project: { select: { name: true, emoji: true, client: { select: { name: true } } } },
      versions: { orderBy: { number: "desc" } },
      reviewComments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!deliverable) notFound();

  const latest = deliverable.versions[0] ?? null;
  const meta = deliverableStatusMeta(deliverable.status);

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
          <p className="text-sm text-muted-foreground">
            {latest ? `Versión ${latest.number}` : "Sin versiones aún"}
            {" · "}Revisa el material, deja comentarios y aprueba o solicita cambios.
          </p>
        </div>

        <ReviewClient
          token={token}
          videoUrl={latest?.fileUrl ?? null}
          versionNumber={latest?.number ?? null}
          status={deliverable.status}
          comments={deliverable.reviewComments.map((c) => ({
            id: c.id,
            authorName: c.authorName,
            body: c.body,
            timecode: c.timecode,
            fromClient: c.fromClient,
            createdAt: c.createdAt.toISOString(),
          }))}
        />
      </main>
    </div>
  );
}
