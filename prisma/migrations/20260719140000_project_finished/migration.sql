-- «Terminados»: archivo de proyectos completados, distinto de la papelera (archivedAt).
-- Columnas NULLABLE → la migración aplica siempre, sin conflicto con datos existentes.
ALTER TABLE "Project" ADD COLUMN "finishedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "finishedById" TEXT;
CREATE INDEX "Project_finishedAt_idx" ON "Project"("finishedAt");
