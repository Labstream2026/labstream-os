-- Galería de fotos 2.0: secciones (nacidas de las subcarpetas al subir), curaduría del equipo
-- (excludedAt: la foto no pasa al cliente) y dimensiones para la cuadrícula justificada.
-- Aditiva e idempotente: no toca datos existentes.
ALTER TABLE "DeliverablePhoto" ADD COLUMN IF NOT EXISTS "section" TEXT;
ALTER TABLE "DeliverablePhoto" ADD COLUMN IF NOT EXISTS "excludedAt" TIMESTAMP(3);
ALTER TABLE "DeliverablePhoto" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "DeliverablePhoto" ADD COLUMN IF NOT EXISTS "height" INTEGER;
