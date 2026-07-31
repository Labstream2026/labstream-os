-- Preferencias de interfaz por USUARIO (vista, orden…): viven en su fila para seguirlo de
-- un equipo a otro, en vez de quedarse en el localStorage de un navegador.
-- Aditiva e idempotente: no toca nada existente.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uiPrefs" JSONB;
