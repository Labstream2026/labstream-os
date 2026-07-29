-- Fusión de «Ubicación del material» (tabla suelta de la Wiki) en el Mapa del material.
-- Lo único que la tabla vieja sabía y el mapa no era la CADUCIDAD, así que el modelo
-- estructurado la absorbe.
--
-- ADITIVA y re-ejecutable a propósito: una columna nullable y un índice, ambos con IF NOT
-- EXISTS. No toca ninguna fila existente, así que `prisma migrate deploy` no puede fallar
-- por datos; y si un despliegue se corta a la mitad, reintentar es seguro.

ALTER TABLE "MaterialLocation" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "MaterialLocation_expiresAt_idx" ON "MaterialLocation"("expiresAt");
