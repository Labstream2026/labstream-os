-- El EQUIPO puede marcar como RESUELTA la corrección del cliente sobre una foto (su marca dibujada
-- o su comentario ya se atendió), como resolved/resolvedAt/resolvedBy de ReviewComment en video.
-- Así el editor tacha lo que ya arregló y el panel de resultados lleva la cuenta de «N por atender».
-- Aditiva e idempotente.
ALTER TABLE "DeliverablePhoto" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "DeliverablePhoto" ADD COLUMN IF NOT EXISTS "resolvedById" TEXT;
