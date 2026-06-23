-- Conversación WhatsApp ↔ agente (sesión separada + idempotencia + trazabilidad).
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "waMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsappMessage_waMessageId_key" ON "WhatsappMessage"("waMessageId");
CREATE INDEX "WhatsappMessage_userId_createdAt_idx" ON "WhatsappMessage"("userId", "createdAt");

ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
