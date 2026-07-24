-- Biblioteca compartida de medios de propuestas: videos de fondo, logos e imágenes
-- reutilizables entre propuestas, etiquetados por categoría (streaming, fotografía…).
-- Aditiva: no toca ninguna tabla existente.
CREATE TABLE "ProposalAsset" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rel" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProposalAsset_kind_category_idx" ON "ProposalAsset"("kind", "category");
CREATE INDEX "ProposalAsset_createdAt_idx" ON "ProposalAsset"("createdAt");

ALTER TABLE "ProposalAsset" ADD CONSTRAINT "ProposalAsset_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
