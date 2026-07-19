-- Auditoría ampliada: IP y meta (JSON) en ActivityLog + índice por usuario para la
-- vista "Por persona". Aditivo puro: no toca datos existentes.
ALTER TABLE "ActivityLog" ADD COLUMN "ip" TEXT;
ALTER TABLE "ActivityLog" ADD COLUMN "meta" JSONB;
CREATE INDEX "ActivityLog_userId_createdAt_idx" ON "ActivityLog"("userId", "createdAt");
