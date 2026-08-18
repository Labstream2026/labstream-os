-- El tramo del cliente, instrumentado: cuándo se le envió la pieza, por dónde, a quién, para
-- cuándo se espera respuesta y si ya se le recordó. Antes el envío solo dejaba bitácora y la
-- bandeja decía «esperando al cliente» sin saber si alguien mandó el enlace de verdad.

-- AlterTable
ALTER TABLE "Deliverable" ADD COLUMN "sentToClientAt" TIMESTAMP(3);
ALTER TABLE "Deliverable" ADD COLUMN "sentToClientVia" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "sentToClientTo" TEXT;
ALTER TABLE "Deliverable" ADD COLUMN "clientReviewDueAt" TIMESTAMP(3);
ALTER TABLE "Deliverable" ADD COLUMN "clientRemindedAt" TIMESTAMP(3);
