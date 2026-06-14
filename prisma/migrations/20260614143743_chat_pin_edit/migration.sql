-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;
