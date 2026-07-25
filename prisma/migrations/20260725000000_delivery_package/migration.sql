-- Paquete de entrega del proyecto: enlace público /entrega/[token] con vigencia + registro de
-- actividad (visitas y descargas). Todo aditivo.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "deliveryNonce" TEXT;
ALTER TABLE "Project" ADD COLUMN "deliveryRevokedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "deliveryExpiresAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "deliveryVisits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN "deliveryEmailTo" TEXT;
ALTER TABLE "Project" ADD COLUMN "deliveryReminderAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Deliverable" ADD COLUMN "deliveryExcluded" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DeliveryEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryEvent_projectId_createdAt_idx" ON "DeliveryEvent"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
