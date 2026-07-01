-- Contenido de publicación del entregable: caption (copy) y hashtags, editables por el equipo
-- y visibles/copiables para el cliente en su sala de revisión.
ALTER TABLE "Deliverable" ADD COLUMN "copy" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "hashtags" TEXT;
