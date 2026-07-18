-- Cita estilo WhatsApp: un mensaje puede referenciar a otro (sin abrir hilo).
ALTER TABLE "ChatMessage" ADD COLUMN "quotedId" TEXT;

-- Índice para resolver la cita rápido y para la FK.
CREATE INDEX "ChatMessage_quotedId_idx" ON "ChatMessage"("quotedId");

-- SetNull: si el mensaje citado se borra en duro, la cita queda huérfana («no disponible»),
-- no se borra el mensaje que cita.
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_quotedId_fkey"
  FOREIGN KEY ("quotedId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
