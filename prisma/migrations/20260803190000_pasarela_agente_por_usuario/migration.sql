-- Pasarela de agente por-usuario: una llave puede actuar EN NOMBRE de quien escribe (resuelto por
-- su número de WhatsApp ya registrado en su ficha), y las ESCRITURAS por esa vía se conceden
-- persona a persona. Aditivo puro: ambos interruptores nacen apagados, así que el
-- comportamiento actual de todas las llaves y usuarios existentes no cambia.

ALTER TABLE "AppKey" ADD COLUMN IF NOT EXISTS "gateway" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "agentWrite" BOOLEAN NOT NULL DEFAULT false;
