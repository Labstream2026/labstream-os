-- Branding del cliente: foto, logo (PNG) y color de fondo del logo.
ALTER TABLE "Client" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "Client" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "Client" ADD COLUMN "logoBg" TEXT;
