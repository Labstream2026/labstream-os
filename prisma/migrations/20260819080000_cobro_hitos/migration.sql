-- Cobro por hitos: el 50 % de anticipo —la norma en producción audiovisual— por fin se puede
-- representar. La cotización guarda el % pactado y una misma cotización puede tener DOS
-- facturas (ANTICIPO al arrancar, SALDO al terminar) sin romper el candado anti-duplicado.

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "advancePct" INTEGER;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "parte" TEXT;
