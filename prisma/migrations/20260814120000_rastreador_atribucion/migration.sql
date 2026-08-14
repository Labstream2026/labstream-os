-- Rastreador Fase 2: a qué proyecto/cliente se atribuye cada rato (deducido del título de
-- la ventana al recibir el lote). Ambas columnas son opcionales: lo que no se puede decir
-- se queda sin atribuir y solo cuenta en el total.

-- AlterTable
ALTER TABLE "WorkBlock" ADD COLUMN "projectId" TEXT;
ALTER TABLE "WorkBlock" ADD COLUMN "clientId" TEXT;

-- CreateIndex
CREATE INDEX "WorkBlock_clientId_startedAt_idx" ON "WorkBlock"("clientId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkBlock_projectId_startedAt_idx" ON "WorkBlock"("projectId", "startedAt");

-- AddForeignKey
ALTER TABLE "WorkBlock" ADD CONSTRAINT "WorkBlock_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkBlock" ADD CONSTRAINT "WorkBlock_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
