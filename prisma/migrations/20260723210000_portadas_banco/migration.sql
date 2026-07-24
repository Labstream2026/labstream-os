-- Banco de PORTADAS del proyecto (pestaña «Portadas» de entregables).
-- Aditiva: tabla nueva + columna nullable en Project. Sin backfill.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "coversRevokedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProjectCover" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "deliverableId" TEXT,
    "decision" TEXT,
    "decisionBy" TEXT,
    "decisionAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectCover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectCover_projectId_idx" ON "ProjectCover"("projectId");

-- CreateIndex
CREATE INDEX "ProjectCover_deliverableId_idx" ON "ProjectCover"("deliverableId");

-- AddForeignKey
ALTER TABLE "ProjectCover" ADD CONSTRAINT "ProjectCover_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCover" ADD CONSTRAINT "ProjectCover_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCover" ADD CONSTRAINT "ProjectCover_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
