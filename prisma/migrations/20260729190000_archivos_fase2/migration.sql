-- Archivos 2.0 (fase 2): última actividad real, fijar en la marca y categorías.
-- updatedAt arranca en createdAt (no en now()): el orden «recientes» no debe mentir el día
-- del deploy. Todo aditivo: nada se borra ni se renombra.

ALTER TABLE "FileAsset" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "FileAsset" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "FileAsset" SET "updatedAt" = "createdAt";
ALTER TABLE "FileAsset" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "FileAsset" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "FileAsset_projectId_updatedAt_idx" ON "FileAsset"("projectId", "updatedAt");

ALTER TABLE "ClientFile" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClientFile" ADD COLUMN "category" TEXT;
ALTER TABLE "ClientFile" ADD COLUMN "note" TEXT;
ALTER TABLE "ClientFile" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "ClientFile" SET "updatedAt" = "createdAt";
ALTER TABLE "ClientFile" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "ClientFile" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
