-- Portadas 2.0: anotaciones sobre la imagen + rastro de autor y actualización. Todo aditivo.

-- AlterTable
ALTER TABLE "ProjectCover" ADD COLUMN "uploadedById" TEXT;
ALTER TABLE "ProjectCover" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "CoverNote" (
    "id" TEXT NOT NULL,
    "coverId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorId" TEXT,
    "fromClient" BOOLEAN NOT NULL DEFAULT true,
    "body" TEXT,
    "drawing" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoverNote_coverId_createdAt_idx" ON "CoverNote"("coverId", "createdAt");

-- AddForeignKey
ALTER TABLE "CoverNote" ADD CONSTRAINT "CoverNote_coverId_fkey" FOREIGN KEY ("coverId") REFERENCES "ProjectCover"("id") ON DELETE CASCADE ON UPDATE CASCADE;
