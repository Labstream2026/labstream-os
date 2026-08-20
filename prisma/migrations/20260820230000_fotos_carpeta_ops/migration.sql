-- Sets de fotos alojados en Operaciones_LAB: la carpeta del disco donde viven las fotos del
-- set (relativa a NAS_OPS_DIR). Aditiva e idempotente.
ALTER TABLE "Deliverable" ADD COLUMN IF NOT EXISTS "photosOpsFolder" TEXT;
