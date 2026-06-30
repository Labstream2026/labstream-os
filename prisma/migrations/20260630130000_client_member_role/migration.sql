-- AlterTable: rol del miembro del cliente (RESPONSABLE / MIEMBRO). Default MIEMBRO conserva el
-- comportamiento actual (todos los miembros existentes quedan como MIEMBRO).
ALTER TABLE "ClientMember" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'MIEMBRO';
