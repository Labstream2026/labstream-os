-- Puente propuesta → cotización + rechazo del cliente con motivo. Todo aditivo.

-- El cliente ya podía aceptar; ahora también puede decir que no, y queda el porqué.
ALTER TYPE "ProposalStatus" ADD VALUE IF NOT EXISTS 'RECHAZADA';

ALTER TABLE "Proposal" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Proposal" ADD COLUMN "rejectedByName" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "rejectedByEmail" TEXT;
ALTER TABLE "Proposal" ADD COLUMN "rejectReason" TEXT;

-- Cotización nacida de la propuesta. SET NULL: borrar la cotización no borra la propuesta.
ALTER TABLE "Proposal" ADD COLUMN "quoteId" TEXT;
CREATE INDEX "Proposal_quoteId_idx" ON "Proposal"("quoteId");
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
