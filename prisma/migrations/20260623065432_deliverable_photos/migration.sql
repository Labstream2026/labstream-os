-- CreateEnum
CREATE TYPE "PhotoPick" AS ENUM ('PENDIENTE', 'ME_GUSTA', 'NO_ME_GUSTA');

-- CreateTable
CREATE TABLE "DeliverablePhoto" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "fileAssetId" TEXT,
    "url" TEXT,
    "filename" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "pick" "PhotoPick" NOT NULL DEFAULT 'PENDIENTE',
    "clientNote" TEXT,
    "pickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverablePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliverablePhoto_deliverableId_idx" ON "DeliverablePhoto"("deliverableId");

-- AddForeignKey
ALTER TABLE "DeliverablePhoto" ADD CONSTRAINT "DeliverablePhoto_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverablePhoto" ADD CONSTRAINT "DeliverablePhoto_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
