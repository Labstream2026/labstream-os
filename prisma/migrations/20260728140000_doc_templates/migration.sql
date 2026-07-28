-- Plantillas de documento de la empresa (guion técnico, presupuesto, propuesta con la marca).
-- Aditiva: no toca ninguna tabla existente.

CREATE TABLE "DocTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ext" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdById" TEXT,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocTemplate_archivedAt_idx" ON "DocTemplate"("archivedAt");

ALTER TABLE "DocTemplate" ADD CONSTRAINT "DocTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
