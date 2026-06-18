-- Marcebot: cierre de semana (viernes). Recuerda el último envío para no repetirlo.
ALTER TABLE "MarcebotState" ADD COLUMN "lastWeeklyOn" TEXT;
