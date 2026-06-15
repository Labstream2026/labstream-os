-- Flujo de revisión de entregables: pre-aprobación interna (bloqueante), decisiones,
-- enlace de revisión con visitas/revocación y modo dibujos.

CREATE TYPE "DecisionStage" AS ENUM ('INTERNA', 'CLIENTE');
CREATE TYPE "DecisionResult" AS ENUM ('APROBADO', 'CAMBIOS');

-- Deliverable: control del enlace de revisión del cliente
ALTER TABLE "Deliverable" ADD COLUMN "reviewVisits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Deliverable" ADD COLUMN "reviewRevokedAt" TIMESTAMP(3);
ALTER TABLE "Deliverable" ADD COLUMN "reviewAllowDrawings" BOOLEAN NOT NULL DEFAULT false;

-- ReviewComment: anotación/dibujo
ALTER TABLE "ReviewComment" ADD COLUMN "drawingData" JSONB;

-- DeliverableVersion: compuerta de pre-aprobación interna
ALTER TABLE "DeliverableVersion" ADD COLUMN "internalApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DeliverableVersion" ADD COLUMN "internalApprovedAt" TIMESTAMP(3);
-- Las versiones que ya existían se consideran aprobadas (no romper enlaces vigentes).
UPDATE "DeliverableVersion" SET "internalApproved" = true, "internalApprovedAt" = "createdAt";

-- Registro de decisiones
CREATE TABLE "DeliverableDecision" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "versionNumber" INTEGER,
    "stage" "DecisionStage" NOT NULL,
    "result" "DecisionResult" NOT NULL,
    "byUserId" TEXT,
    "byName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverableDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliverableDecision_deliverableId_createdAt_idx" ON "DeliverableDecision"("deliverableId", "createdAt");

ALTER TABLE "DeliverableDecision" ADD CONSTRAINT "DeliverableDecision_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliverableDecision" ADD CONSTRAINT "DeliverableDecision_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
