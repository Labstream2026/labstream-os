-- Archivos finales por formato (centro de descargas del cliente). Cada fila = un formato con su
-- enlace de descarga. Lo gestiona el equipo; el cliente lo descarga cuando la pieza está lista.
CREATE TABLE "DeliverableRendition" (
    "id" TEXT NOT NULL,
    "deliverableId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "label" TEXT,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliverableRendition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliverableRendition_deliverableId_idx" ON "DeliverableRendition"("deliverableId");

ALTER TABLE "DeliverableRendition" ADD CONSTRAINT "DeliverableRendition_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE CASCADE ON UPDATE CASCADE;
