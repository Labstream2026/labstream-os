-- Borrado suave de mensajes de chat (auditoría para administradores)
ALTER TABLE "ChatMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "deletedById" TEXT;
