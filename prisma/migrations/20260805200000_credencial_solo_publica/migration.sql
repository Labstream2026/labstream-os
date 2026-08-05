-- Credencial solo-pública: la que usará el número comercial de WhatsApp.
-- Aditiva: una columna con valor por defecto. Ninguna llave existente cambia de comportamiento.
ALTER TABLE "AppKey" ADD COLUMN IF NOT EXISTS "publicOnly" BOOLEAN NOT NULL DEFAULT false;
