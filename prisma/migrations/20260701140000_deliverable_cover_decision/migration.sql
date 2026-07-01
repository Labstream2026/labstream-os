-- Decisión del cliente sobre la portada del reel (aprobar / pedir cambios). La decisión se ata al
-- archivo de portada revisado (coverDecisionFor); si el equipo sube una portada nueva, vuelve a
-- quedar pendiente automáticamente.
ALTER TABLE "Deliverable" ADD COLUMN "coverDecisionFor" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "coverDecision" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "coverDecisionBy" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "coverDecisionAt" TIMESTAMP(3);
ALTER TABLE "Deliverable" ADD COLUMN "coverDecisionNote" TEXT;
