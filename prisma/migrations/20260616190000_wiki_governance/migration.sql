-- Wiki: gobernanza (dueño + última revisión), secciones, etiquetas y plantilla.
ALTER TABLE "WikiPage" ADD COLUMN "section" TEXT;
ALTER TABLE "WikiPage" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WikiPage" ADD COLUMN "templateKey" TEXT;
ALTER TABLE "WikiPage" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "WikiPage" ADD COLUMN "lastReviewedById" TEXT;
ALTER TABLE "WikiPage" ADD COLUMN "lastReviewedAt" TIMESTAMP(3);

CREATE INDEX "WikiPage_section_idx" ON "WikiPage" ("section");

ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_lastReviewedById_fkey" FOREIGN KEY ("lastReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
