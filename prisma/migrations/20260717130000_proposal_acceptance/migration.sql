-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedByName" TEXT,
ADD COLUMN     "acceptedByEmail" TEXT,
ADD COLUMN     "acceptedByIp" TEXT;
