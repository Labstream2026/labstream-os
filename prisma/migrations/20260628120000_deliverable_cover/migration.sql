-- AlterTable
ALTER TABLE "Deliverable" ADD COLUMN     "coverFileAssetId" TEXT;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_coverFileAssetId_fkey" FOREIGN KEY ("coverFileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
