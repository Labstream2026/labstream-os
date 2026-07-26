-- Notas ↔ Tareas: una tarea puede nacer de una nota (de una línea con casilla, o de la nota
-- entera). `noteLine` guarda el TEXTO normalizado de la línea de origen para volver a
-- encontrarla aunque la nota se reordene; con eso, al completar la tarea se marca su casilla.
ALTER TABLE "Task" ADD COLUMN "noteId" TEXT;
ALTER TABLE "Task" ADD COLUMN "noteLine" TEXT;

CREATE INDEX "Task_noteId_idx" ON "Task"("noteId");

-- Si la nota se elimina definitivamente, la tarea SOBREVIVE (solo pierde el vínculo).
ALTER TABLE "Task" ADD CONSTRAINT "Task_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
