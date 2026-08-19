-- Dominio de correo → cliente: «todo lo de @pepsico.com es Pepsico». Segmentación por
-- empresa, curada a mano y global.

-- CreateTable
CREATE TABLE "ClientMailDomain" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientMailDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientMailDomain_domain_key" ON "ClientMailDomain"("domain");

-- CreateIndex
CREATE INDEX "ClientMailDomain_clientId_idx" ON "ClientMailDomain"("clientId");

-- AddForeignKey
ALTER TABLE "ClientMailDomain" ADD CONSTRAINT "ClientMailDomain_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientMailDomain" ADD CONSTRAINT "ClientMailDomain_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
