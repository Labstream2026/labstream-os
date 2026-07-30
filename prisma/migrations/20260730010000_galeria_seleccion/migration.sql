-- Enlace público de una SELECCIÓN de piezas de la galería (hermana de GaleriaEntrega).
-- Aditiva: no toca nada existente.

-- CreateTable
CREATE TABLE "GaleriaSeleccion" (
    "id" TEXT NOT NULL,
    "rels" JSONB NOT NULL,
    "titulo" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "visitas" INTEGER NOT NULL DEFAULT 0,
    "ultimaVisitaAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GaleriaSeleccion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GaleriaSeleccion_expiresAt_idx" ON "GaleriaSeleccion"("expiresAt");
