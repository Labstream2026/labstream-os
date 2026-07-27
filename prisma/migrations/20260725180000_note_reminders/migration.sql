-- El recordatorio de una nota deja de ser un campo suelto (`Note.remindAt`, que solo sabía
-- notificar una vez) y pasa a ser un Reminder de verdad: sale en /recordatorios, se pospone,
-- se marca como hecho, se repite, se le puede dejar a un compañero y su aviso ABRE la nota.
ALTER TABLE "Reminder" ADD COLUMN "noteId" TEXT;

CREATE INDEX "Reminder_noteId_idx" ON "Reminder"("noteId");

-- Si la nota se elimina definitivamente, su recordatorio se va con ella.
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
