-- AlterTable: clientes activos/inactivos (los existentes quedan activos por defecto).
ALTER TABLE "Client" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
