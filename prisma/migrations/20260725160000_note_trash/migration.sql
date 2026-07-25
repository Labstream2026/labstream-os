-- Papelera de notas: borrar una nota deja de ser definitivo. `archivedAt` marca cuándo
-- se mandó a la papelera (NULL = activa) y `archivedById` quién lo hizo. La purga
-- definitiva sigue existiendo, pero es un segundo paso explícito.
ALTER TABLE "Note" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Note" ADD COLUMN "archivedById" TEXT;

-- Índice para listar la papelera del usuario (y para excluirla del resto de consultas).
CREATE INDEX "Note_archivedAt_idx" ON "Note"("archivedAt");
