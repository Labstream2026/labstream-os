-- Archivar entregables: los saca del inbox activo de /revisiones (gestión del equipo) sin tocar
-- el enlace de entrega (sigue vivo hasta que se borre). Aditivo: NULL = no archivado.
ALTER TABLE "Deliverable" ADD COLUMN "archivedAt" TIMESTAMP(3);
