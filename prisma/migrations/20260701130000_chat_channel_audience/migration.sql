-- Un canal de PROYECTO ahora se distingue por AUDIENCIA (interno / con el cliente), lo que permite
-- DOS canales por proyecto: uno solo del equipo y otro con el cliente invitado. Los canales de
-- proyecto existentes pasan a "INTERNAL" (conservan su historial como chat SOLO del equipo).
ALTER TABLE "ChatChannel" ADD COLUMN "audience" TEXT;

UPDATE "ChatChannel" SET "audience" = 'INTERNAL' WHERE "type" = 'PROJECT';

-- Se reemplaza el único de un-canal-por-proyecto por uno compuesto (proyecto + audiencia).
DROP INDEX IF EXISTS "ChatChannel_projectId_key";
CREATE UNIQUE INDEX "ChatChannel_projectId_audience_key" ON "ChatChannel"("projectId", "audience");
