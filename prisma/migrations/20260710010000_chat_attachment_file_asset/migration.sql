-- Los DOCUMENTOS adjuntados en el chat de un PROYECTO se archivan también en la pestaña
-- Archivos del proyecto (FileAsset espejo, con chip «chat» que enlaza al mensaje). El adjunto
-- guarda aquí el archivo espejo. SetNull: si el archivo se borra de Archivos, el adjunto del
-- chat sigue intacto (solo pierde el vínculo).

-- AlterTable
ALTER TABLE "MessageAttachment" ADD COLUMN "fileAssetId" TEXT;

-- CreateIndex
CREATE INDEX "MessageAttachment_fileAssetId_idx" ON "MessageAttachment"("fileAssetId");

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
