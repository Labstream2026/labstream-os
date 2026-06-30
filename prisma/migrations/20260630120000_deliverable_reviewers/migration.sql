-- CreateTable
CREATE TABLE "DeliverableReviewer" (
    "deliverableId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliverableReviewer_pkey" PRIMARY KEY ("deliverableId","userId")
);

-- CreateIndex
CREATE INDEX "DeliverableReviewer_userId_idx" ON "DeliverableReviewer"("userId");

-- AddForeignKey
ALTER TABLE "DeliverableReviewer" ADD CONSTRAINT "DeliverableReviewer_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliverableReviewer" ADD CONSTRAINT "DeliverableReviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: el revisor primario existente (reviewerId) pasa a ser tambien co-revisor, para que el
-- comportamiento actual se preserve (sigue viendo el entregable en su bandeja y puede pre-aprobar).
INSERT INTO "DeliverableReviewer" ("deliverableId", "userId", "createdAt")
SELECT "id", "reviewerId", CURRENT_TIMESTAMP FROM "Deliverable" WHERE "reviewerId" IS NOT NULL
ON CONFLICT DO NOTHING;
