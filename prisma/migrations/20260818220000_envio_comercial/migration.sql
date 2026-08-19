-- Sello de envío y aperturas del cliente en cotizaciones y propuestas. El radar comercial
-- medía «hace cuánto no responde» desde updatedAt: corregir una coma reiniciaba el reloj y
-- borraba la persecución. Ahora mide desde el envío real, y la página pública cuenta cuándo
-- (y cuántas veces) el cliente abrió.

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "openCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Quote" ADD COLUMN "lastOpenedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "Proposal" ADD COLUMN "lastOpenedAt" TIMESTAMP(3);
