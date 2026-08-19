-- Correo Fase B: posponer (solo local — MailPlus no tiene el concepto) y borradores con
-- autoguardado. Posponer es un filtro por tiempo: al vencer, el hilo reaparece sin cron.

-- AlterTable
ALTER TABLE "MailMessage" ADD COLUMN "snoozedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MailDraft" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "para" TEXT NOT NULL DEFAULT '',
    "cc" TEXT NOT NULL DEFAULT '',
    "asunto" TEXT NOT NULL DEFAULT '',
    "texto" TEXT NOT NULL DEFAULT '',
    "responderAId" TEXT,
    "reenviarDeId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailDraft_accountId_updatedAt_idx" ON "MailDraft"("accountId", "updatedAt");

-- AddForeignKey
ALTER TABLE "MailDraft" ADD CONSTRAINT "MailDraft_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
