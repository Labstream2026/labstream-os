-- Responsable de revisión (taguear) + caducidad opcional del enlace del cliente.
ALTER TABLE "Deliverable" ADD COLUMN "reviewerId" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "reviewExpiresAt" TIMESTAMP(3);

ALTER TABLE "Deliverable"
  ADD CONSTRAINT "Deliverable_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Deliverable_reviewerId_idx" ON "Deliverable"("reviewerId");
