-- Actor de la notificación (quién la originó): para agrupar por persona y mostrar su color.
-- Aditivo y seguro: columna opcional + FK ON DELETE SET NULL + índice. No toca datos existentes.
ALTER TABLE "Notification" ADD COLUMN "actorId" TEXT;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
