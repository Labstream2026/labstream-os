-- Correo 2.0: firmas en alta calidad (imagen incrustada CID), correos asignados a
-- proyectos, biblioteca de GIFs del estudio y reglas simples de bandeja.

-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN "signatureHtml" TEXT,
ADD COLUMN "signatureImage" BYTEA,
ADD COLUMN "signatureImageMime" TEXT;

-- AlterTable
ALTER TABLE "MailMessage" ADD COLUMN "projectId" TEXT;

-- CreateTable
CREATE TABLE "MailGif" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "mime" TEXT NOT NULL DEFAULT 'image/gif',
    "bytes" BYTEA NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailGif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailRule" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "projectId" TEXT,
    "archivar" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailMessage_projectId_idx" ON "MailMessage"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "MailRule_accountId_fromEmail_key" ON "MailRule"("accountId", "fromEmail");

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailGif" ADD CONSTRAINT "MailGif_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailRule" ADD CONSTRAINT "MailRule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailRule" ADD CONSTRAINT "MailRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
