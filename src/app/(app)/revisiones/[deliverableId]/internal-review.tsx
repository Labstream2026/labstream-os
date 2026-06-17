"use client";

import { ReviewStage, type StageVersion, type StageComment } from "@/components/review/review-stage";
import { addInternalReviewComment, internalDecision, resolveReviewComment } from "@/app/(app)/proyectos/[id]/actions";

// Workspace de revisión del responsable: el mismo escenario que ve el cliente, pero
// atribuido al equipo, con botón «Pre-aprobado» (no «Aprobado») y la posibilidad de
// resolver comentarios. La pre-aprobación aplica a la versión que se está viendo.
export function InternalReview({
  deliverableId,
  projectId,
  versions,
  comments,
  status,
  meName,
  canDecide,
}: {
  deliverableId: string;
  projectId: string;
  versions: StageVersion[];
  comments: StageComment[];
  status: string;
  meName: string;
  canDecide: boolean;
}) {
  return (
    <ReviewStage
      mode="internal"
      versions={versions}
      comments={comments}
      status={status}
      allowDrawings
      defaultName={meName}
      fixedName
      decision={{ approveLabel: "Pre-aprobado", changesLabel: "Solicitar cambios" }}
      canDecide={canDecide}
      onComment={(fd) => addInternalReviewComment(deliverableId, fd)}
      onDecision={(result, note, _name, versionNumber) =>
        internalDecision(deliverableId, projectId, versionNumber, result, note || undefined)
      }
      onResolve={(commentId, resolved) => resolveReviewComment(commentId, projectId, resolved)}
    />
  );
}
