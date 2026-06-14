-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ColumnType" ADD VALUE 'MULTISELECT';
ALTER TYPE "ColumnType" ADD VALUE 'PASSWORD';
ALTER TYPE "ColumnType" ADD VALUE 'IMAGE';
ALTER TYPE "ColumnType" ADD VALUE 'LONGTEXT';

-- AlterEnum
ALTER TYPE "FileKind" ADD VALUE 'NAS';

-- AlterTable
ALTER TABLE "ActivityLog" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "color" TEXT;

-- AlterTable
ALTER TABLE "ProjectFolder" ADD COLUMN     "color" TEXT,
ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT;

-- CreateIndex
CREATE INDEX "ActivityLog_clientId_createdAt_idx" ON "ActivityLog"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
