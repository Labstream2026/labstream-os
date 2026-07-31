"use client";

import * as React from "react";
import { ReviewStage, type StageVersion, type StageComment } from "@/components/review/review-stage";
import {
  addInternalReviewComment,
  internalDecision,
  editReviewComment,
  deleteReviewComment,
  replyToReviewComment,
  resolveReviewComment,
  setReviewCommentPriority,
} from "@/app/(app)/proyectos/[id]/actions";
import { EnviarAlCliente } from "./enviar-al-cliente";

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
  envio,
}: {
  deliverableId: string;
  projectId: string;
  versions: StageVersion[];
  comments: StageComment[];
  status: string;
  meName: string;
  canDecide: boolean;
  orientation?: "vertical" | "horizontal";
  // Lo que hace falta para ofrecer el enlace en cuanto se pre-aprueba.
  envio: {
    titulo: string;
    proyecto: string;
    cliente: string | null;
    url: string;
    venceLabel: string | null;
    puedeEnviar: boolean;
    correoActivo: boolean;
  };
}) {
  const [enviando, setEnviando] = React.useState(false);

  return (
    <>
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
        askFixDeadline
        resumeKey={`int:${deliverableId}`}
        // El EQUIPO también revisa reels desde el celular: mismo modo inmersivo del portal.
        immersiveEligible={orientation === "vertical"}
        onComment={(fd) => addInternalReviewComment(deliverableId, fd)}
        // La ventana de «ahora mándaselo al cliente» se abre ENVOLVIENDO la decisión, no
        // interceptándola con onDecisionIntent: ese gancho se lleva los DOS botones, y
        // «Solicitar cambios» tiene dentro del escenario su propio diálogo de plazo que hay
        // que dejar intacto. Así solo se añade un paso cuando de verdad se pre-aprueba.
        onDecision={async (result, note, _name, versionNumber, fixDueIso) => {
          await internalDecision(deliverableId, projectId, versionNumber, result, note || undefined, fixDueIso ?? null);
          if (result === "APROBADO") setEnviando(true);
        }}
        onEdit={(id, body) => editReviewComment(id, projectId, body)}
        onDelete={(id) => deleteReviewComment(id, projectId)}
        // Hilos: el equipo responde bajo la corrección y elige si el cliente lo ve.
        onReply={(id, body, visibleToClient) => replyToReviewComment(id, projectId, body, visibleToClient)}
        onSetPriority={(id, priority) => setReviewCommentPriority(id, projectId, priority)}
        // Reabrir lo que se dio por hecho. NO se pasa onResolve a propósito: las casillas del
        // checklist son del editor y viven en la pestaña de Entregables, no en este workspace.
        onReopen={(id) => resolveReviewComment(id, projectId, false)}
      />

      {enviando ? (
        <EnviarAlCliente
          deliverableId={deliverableId}
          titulo={envio.titulo}
          proyecto={envio.proyecto}
          cliente={envio.cliente}
          url={envio.url}
          venceLabel={envio.venceLabel}
          puedeEnviar={envio.puedeEnviar}
          correoActivo={envio.correoActivo}
          deQuien={meName}
          onCerrar={() => setEnviando(false)}
        />
      ) : null}
    </>
  );
}
