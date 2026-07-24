-- Operaciones_LAB: carpeta vinculada por proyecto + archivos vivos del bind mount (kind OPS).
-- Aditiva: nada existente cambia.
ALTER TYPE "FileKind" ADD VALUE 'OPS';

ALTER TABLE "Project" ADD COLUMN "opsFolder" TEXT;
