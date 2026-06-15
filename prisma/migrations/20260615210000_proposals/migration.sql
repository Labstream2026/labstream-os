-- Propuestas interactivas (constructor por bloques + asistente)
CREATE TYPE "ProposalStatus" AS ENUM ('BORRADOR', 'ENVIADA', 'ACEPTADA', 'VENCIDA');

CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'BORRADOR',
    "expiresAt" TIMESTAMP(3),
    "views" INTEGER NOT NULL DEFAULT 0,
    "answers" JSONB,
    "brand" JSONB NOT NULL,
    "blocks" JSONB NOT NULL,
    "clientId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Proposal_code_key" ON "Proposal"("code");
CREATE INDEX "Proposal_clientId_idx" ON "Proposal"("clientId");
CREATE INDEX "Proposal_createdAt_idx" ON "Proposal"("createdAt");

ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
