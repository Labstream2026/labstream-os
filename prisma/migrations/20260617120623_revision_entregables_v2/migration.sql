-- AlterTable
ALTER TABLE "ReviewComment" ADD COLUMN     "authorUserId" TEXT,
ADD COLUMN     "isNote" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ReviewComment_authorUserId_idx" ON "ReviewComment"("authorUserId");

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
