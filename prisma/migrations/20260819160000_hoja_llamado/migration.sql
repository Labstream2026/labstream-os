-- Hoja de llamado: el documento del día de rodaje. Personas citadas (equipo o freelancers)
-- con confirmación individual, locación, cronograma, plan de equipos vinculado y enlace
-- público firmado.

-- CreateTable
CREATE TABLE "CallSheet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "titulo" TEXT,
    "citacionGeneral" TEXT,
    "locacion" TEXT,
    "direccion" TEXT,
    "indicaciones" TEXT,
    "clienteEnSet" TEXT,
    "notas" TEXT,
    "bloques" JSONB,
    "equipmentPlanId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "sentAt" TIMESTAMP(3),
    "publicRevokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSheetPerson" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "userId" TEXT,
    "nombre" TEXT,
    "rol" TEXT,
    "telefono" TEXT,
    "citacion" TEXT,
    "confirmadoAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CallSheetPerson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CallSheet_projectId_fecha_idx" ON "CallSheet"("projectId", "fecha");

-- CreateIndex
CREATE INDEX "CallSheetPerson_sheetId_idx" ON "CallSheetPerson"("sheetId");

-- CreateIndex
CREATE UNIQUE INDEX "CallSheetPerson_sheetId_userId_key" ON "CallSheetPerson"("sheetId", "userId");

-- AddForeignKey
ALTER TABLE "CallSheet" ADD CONSTRAINT "CallSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSheet" ADD CONSTRAINT "CallSheet_equipmentPlanId_fkey" FOREIGN KEY ("equipmentPlanId") REFERENCES "EquipmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSheet" ADD CONSTRAINT "CallSheet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSheetPerson" ADD CONSTRAINT "CallSheetPerson_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "CallSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSheetPerson" ADD CONSTRAINT "CallSheetPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
