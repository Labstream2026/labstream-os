-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "color" TEXT,
ADD COLUMN     "remindAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'private';

-- CreateIndex
CREATE INDEX "Note_visibility_idx" ON "Note"("visibility");

-- CreateIndex
CREATE INDEX "Note_remindAt_idx" ON "Note"("remindAt");

