-- Chat por cliente: nuevo tipo de canal y vínculo único al cliente.
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'CLIENT';
ALTER TABLE "ChatChannel" ADD COLUMN "clientId" TEXT;
CREATE UNIQUE INDEX "ChatChannel_clientId_key" ON "ChatChannel"("clientId");
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
