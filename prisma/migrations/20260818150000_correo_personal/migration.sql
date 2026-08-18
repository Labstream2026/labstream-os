-- Correo personal dentro de la app: cada persona conecta SU buzón de MailPlus (que vive en
-- este mismo NAS). MailAccount guarda la credencial cifrada; MailMessage, la bandeja
-- sincronizada. El HTML se guarda crudo y SIEMPRE se sanea al servir.

-- CreateTable
CREATE TABLE "MailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "tlsRelaxed" BOOLEAN NOT NULL DEFAULT true,
    "lastUid" BIGINT NOT NULL DEFAULT 0,
    "uidValidity" BIGINT,
    "lastSyncAt" TIMESTAMP(3),
    "syncError" TEXT,
    "sentFolder" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "uid" BIGINT NOT NULL,
    "folder" TEXT NOT NULL DEFAULT 'INBOX',
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "fromName" TEXT,
    "fromEmail" TEXT,
    "toList" TEXT NOT NULL DEFAULT '',
    "subject" TEXT NOT NULL DEFAULT '',
    "date" TIMESTAMP(3) NOT NULL,
    "snippet" TEXT NOT NULL DEFAULT '',
    "textBody" TEXT,
    "htmlBody" TEXT,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "answered" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailAccount_userId_key" ON "MailAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MailMessage_accountId_folder_uid_key" ON "MailMessage"("accountId", "folder", "uid");

-- CreateIndex
CREATE INDEX "MailMessage_accountId_date_idx" ON "MailMessage"("accountId", "date");

-- CreateIndex
CREATE INDEX "MailMessage_accountId_seen_idx" ON "MailMessage"("accountId", "seen");

-- AddForeignKey
ALTER TABLE "MailAccount" ADD CONSTRAINT "MailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
