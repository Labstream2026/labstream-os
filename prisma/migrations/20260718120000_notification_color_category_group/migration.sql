-- AlterTable: color del responsable (subject), categoría, prioridad y agrupador de ráfagas
ALTER TABLE "Notification" ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "groupKey" TEXT;

-- CreateIndex
CREATE INDEX "Notification_subjectId_idx" ON "Notification"("subjectId");

-- CreateIndex
CREATE INDEX "Notification_userId_groupKey_idx" ON "Notification"("userId", "groupKey");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
