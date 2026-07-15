-- CreateEnum
CREATE TYPE "ReviewPriority" AS ENUM ('OBLIGATORIA', 'SUGERENCIA');

-- AlterTable
ALTER TABLE "ReviewComment" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "priority" "ReviewPriority" NOT NULL DEFAULT 'OBLIGATORIA',
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT;

-- CreateIndex
CREATE INDEX "ReviewComment_parentId_idx" ON "ReviewComment"("parentId");

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ReviewComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

