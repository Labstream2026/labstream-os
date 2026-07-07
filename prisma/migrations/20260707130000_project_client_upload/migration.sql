-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "uploadDir" TEXT,
ADD COLUMN     "uploadExpiresAt" TIMESTAMP(3),
ADD COLUMN     "uploadNonce" TEXT,
ADD COLUMN     "uploadRevokedAt" TIMESTAMP(3),
ADD COLUMN     "uploadVisits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN     "uploaderName" TEXT,
ADD COLUMN     "viaClientLink" BOOLEAN NOT NULL DEFAULT false;

