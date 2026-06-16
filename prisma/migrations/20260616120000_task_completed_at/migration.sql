-- Marca temporal de cuándo se terminó una tarea (estado isDone).
ALTER TABLE "Task" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Índice para listar las completadas recientes por usuario rápido.
CREATE INDEX "Task_completedAt_idx" ON "Task" ("completedAt");
