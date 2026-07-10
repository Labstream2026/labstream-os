-- Flujo de entregables: consecutivo por proyecto, SLA de pre-aprobación/corrección e
-- ítems de entregable en tareas (con marca de incumplimiento). Todo aditivo: no toca datos.

-- Task: ítem de entregable (se completa solo al mandar la versión) + incumplimiento de SLA.
ALTER TABLE "Task" ADD COLUMN "isDeliverableWork" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "breachedAt" TIMESTAMP(3);

-- Deliverable: consecutivo por proyecto + plazos del flujo.
ALTER TABLE "Deliverable" ADD COLUMN "number" INTEGER;
ALTER TABLE "Deliverable" ADD COLUMN "internalReviewDueAt" TIMESTAMP(3);
ALTER TABLE "Deliverable" ADD COLUMN "fixDueAt" TIMESTAMP(3);

-- Backfill del consecutivo: por proyecto, en orden de creación (#1 = el más antiguo).
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "Deliverable"
)
UPDATE "Deliverable" d
SET "number" = numbered.rn
FROM numbered
WHERE d."id" = numbered."id";
