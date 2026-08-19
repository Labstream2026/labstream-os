-- Cola de salida del correo: «deshacer envío» y «programar envío». El mensaje espera aquí
-- YA COMPUESTO (crudo MIME); deshacer a tiempo lo borra sin que nada llegue al SMTP.
CREATE TABLE "MailOutbox" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoError" TEXT,
    "crudo" BYTEA NOT NULL,
    "messageId" TEXT,
    "para" TEXT NOT NULL,
    "cc" TEXT NOT NULL DEFAULT '',
    "asunto" TEXT NOT NULL DEFAULT '',
    "htmlUsuario" TEXT NOT NULL DEFAULT '',
    "colaLocal" TEXT NOT NULL DEFAULT '',
    "textoLocal" TEXT NOT NULL DEFAULT '',
    "enRespuestaA" TEXT,
    "referencias" TEXT,
    "respondeAId" TEXT,
    "reenviaDeId" TEXT,
    "projectId" TEXT,
    "adjuntosMeta" JSONB,
    "nombreRemitente" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MailOutbox_estado_sendAt_idx" ON "MailOutbox"("estado", "sendAt");

CREATE INDEX "MailOutbox_accountId_estado_idx" ON "MailOutbox"("accountId", "estado");

ALTER TABLE "MailOutbox" ADD CONSTRAINT "MailOutbox_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
