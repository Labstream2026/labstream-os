-- Enlace de BORRADOR del entregable: revisión temprana con un externo mientras la pieza
-- sigue en producción/edición. Aditivo puro (columnas nuevas nullable + un contador con
-- default): los entregables existentes quedan con draftShareAt NULL = sin borrador vivo,
-- y el enlace oficial no se toca.

ALTER TABLE "Deliverable" ADD COLUMN IF NOT EXISTS "draftShareAt" TIMESTAMP(3);
ALTER TABLE "Deliverable" ADD COLUMN IF NOT EXISTS "draftShareById" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN IF NOT EXISTS "draftShareVisits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Deliverable" ADD COLUMN IF NOT EXISTS "draftShareExpiresAt" TIMESTAMP(3);

-- Marca del comentario que llegó por el enlace de borrador, para que el editor distinga una nota
-- de fase temprana de una corrección formal. Los existentes quedan en false (ninguno lo era).
ALTER TABLE "ReviewComment" ADD COLUMN IF NOT EXISTS "fromDraft" BOOLEAN NOT NULL DEFAULT false;
