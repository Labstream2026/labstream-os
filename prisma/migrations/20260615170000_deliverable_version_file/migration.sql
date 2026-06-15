-- Vincula cada versión de entregable con un archivo subido (para el portal del cliente).
ALTER TABLE "DeliverableVersion" ADD COLUMN "fileAssetId" TEXT;
ALTER TABLE "DeliverableVersion" ADD CONSTRAINT "DeliverableVersion_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DeliverableVersion_fileAssetId_idx" ON "DeliverableVersion"("fileAssetId");
