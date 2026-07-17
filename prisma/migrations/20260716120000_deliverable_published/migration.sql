-- AlterTable
ALTER TABLE "Deliverable" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedById" TEXT;

-- CreateIndex
CREATE INDEX "Deliverable_publishedAt_idx" ON "Deliverable"("publishedAt");

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
