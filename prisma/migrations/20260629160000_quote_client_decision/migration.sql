-- Decisión del cliente en el portal, separada del estado interno de aprobación.
ALTER TABLE "Quote" ADD COLUMN "clientDecision" TEXT;
ALTER TABLE "Quote" ADD COLUMN "clientDecidedAt" TIMESTAMP(3);
