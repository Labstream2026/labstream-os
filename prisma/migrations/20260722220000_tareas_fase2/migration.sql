-- Tareas 2.0 (Fase 2): plantillas de checklist + detector de estancadas + capacidad semanal
-- (aditiva: columnas nuevas con default / nulables, tabla nueva; no toca datos)

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "staleNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "weeklyCapacityHours" INTEGER NOT NULL DEFAULT 40;

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "labels" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);
