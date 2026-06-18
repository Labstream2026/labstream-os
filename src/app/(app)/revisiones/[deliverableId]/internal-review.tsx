"use client";

import { ReviewStage, type StageVersion, type StageComment } from "@/components/review/review-stage";
import { addInternalReviewComment, internalDecision, editReviewComment, deleteReviewComment } from "@/app/(app)/proyectos/[id]/actions";

// Workspace de revisión del responsable: reproduce el material, deja comentarios con
// captura y decide (Pre-aprobado / Solicitar cambios). El CHECKLIST de correcciones (con
// las casillas para marcar realizado) NO vive aquí, sino en la vista del entregable
// (pestaña Entregables del proyecto), que es donde trabaja el editor.
export function InternalReview({
  deliverableId,
  projectId,
  versions,
  comments,
  status,
  meName,
  canDecide,
  orientation = "horizontal",
}: {
  deliverableId: string;
  projectId: string;
  versions: StageVersion[];
  comments: StageComment[];
  status: string;
  meName: string;
  canDecide: boolean;
  orientation?: "vertical" | "horizontal";
}) {
  return (
    <ReviewStage
      mode="internal"
      versions={versions}
      comments={comments}
      status={status}
      allowDrawings
      orientation={orientation}
      defaultName={meName}
      fixedName
      decision={{ approveLabel: "Pre-aprobado", changesLabel: "Solicitar cambios" }}
      canDecide={canDecide}
      onComment={(fd) => addInternalReviewComment(deliverableId, fd)}
      onDecision={(result, note, _name, versionNumber) =>
        internalDecision(deliverableId, projectId, versionNumber, result, note || undefined)
      }
      onEdit={(id, body) => editReviewComment(id, projectId, body)}
      onDelete={(id) => deleteReviewComment(id, projectId)}
    />
  );
}
