-- Correo v2 (estilo Gmail): conversaciones, estrella, CC, archivo/papelera sincronizados con
-- el servidor, y el cliente del CRM detectado por remitente.

-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN "archiveFolder" TEXT;
ALTER TABLE "MailAccount" ADD COLUMN "trashFolder" TEXT;

-- AlterTable
ALTER TABLE "MailMessage" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MailMessage" ADD COLUMN "ccList" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MailMessage" ADD COLUMN "threadKey" TEXT;
ALTER TABLE "MailMessage" ADD COLUMN "clientId" TEXT;

-- Backfill del hilo para lo ya sincronizado: la raíz aproximada es a-quién-responde, o el
-- propio Message-ID si abre conversación. Los mensajes nuevos llegan con la raíz real
-- (References completo) desde el sync.
UPDATE "MailMessage" SET "threadKey" = COALESCE("inReplyTo", "messageId", "id") WHERE "threadKey" IS NULL;

-- CreateIndex
CREATE INDEX "MailMessage_accountId_threadKey_idx" ON "MailMessage"("accountId", "threadKey");
CREATE INDEX "MailMessage_accountId_clientId_idx" ON "MailMessage"("accountId", "clientId");

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
