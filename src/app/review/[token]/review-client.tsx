"use client";

import { ReviewStage, type StageVersion, type StageComment } from "@/components/review/review-stage";
import { addReviewComment, setReviewDecision } from "./actions";

// Wrapper del portal PÚBLICO del cliente sobre el escenario de revisión compartido.
// El cliente escribe su nombre, comenta por momento (con captura automática del frame),
// deja notas y decide: «Aprobar entregable» / «Solicitar cambios».
export type ReviewVersion = StageVersion;
export type { StageComment };

export function ReviewClient({
  token,
  versions,
  comments,
  status,
  allowDrawings,
}: {
  token: string;
  versions: StageVersion[];
  comments: StageComment[];
  status: string;
  allowDrawings: boolean;
}) {
  return (
    <ReviewStage
      mode="client"
      versions={versions}
      comments={comments}
      status={status}
      allowDrawings={allowDrawings}
      decision={{ approveLabel: "Aprobar entregable", changesLabel: "Solicitar cambios" }}
      onComment={(fd) => addReviewComment(token, fd)}
      onDecision={(result, _note, name) =>
        setReviewDecision(token, result === "APROBADO" ? "APROBADO" : "CORRECCIONES", name)
      }
    />
  );
}
