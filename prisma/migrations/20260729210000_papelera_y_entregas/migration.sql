-- Papelera de archivos (30 días) + las entregas de la galería como filas.
-- Todo aditivo: no se borra ni se renombra nada.

-- ── Papelera ──
-- Solo la fecha. El borrado REAL (que arrastra en cascada fotos de entregable, portadas del
-- banco, historial de versiones y comentarios del documento) queda para el barredor.
ALTER TABLE "FileAsset" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "FileAsset_projectId_deletedAt_idx" ON "FileAsset"("projectId", "deletedAt");
CREATE INDEX "FileAsset_deletedAt_idx" ON "FileAsset"("deletedAt");

-- ── Entregas de la galería ──
CREATE TABLE "GaleriaEntrega" (
  "id"             TEXT NOT NULL,
  "folderRel"      TEXT NOT NULL,
  "version"        INTEGER NOT NULL DEFAULT 1,
  "revokedAt"      TIMESTAMP(3),
  "titulo"         TEXT,
  "visitas"        INTEGER NOT NULL DEFAULT 0,
  "ultimaVisitaAt" TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GaleriaEntrega_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GaleriaEntrega_folderRel_key" ON "GaleriaEntrega"("folderRel");
CREATE INDEX "GaleriaEntrega_revokedAt_idx" ON "GaleriaEntrega"("revokedAt");

-- Backfill: cada ruta que estaba en la lista de AppConfig entra como entrega RETIRADA. Si esto
-- no corriera, un enlace que el equipo dio por cortado volvería a abrir el día del despliegue.
INSERT INTO "GaleriaEntrega" ("id", "folderRel", "version", "revokedAt", "visitas", "createdAt", "updatedAt")
SELECT 'ge_' || md5(r.ruta), r.ruta, 1, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AppConfig" a, LATERAL jsonb_array_elements_text(a."value" -> 'rutas') AS r(ruta)
WHERE a."key" = 'galeria:entregasRevocadas'
  AND jsonb_typeof(a."value" -> 'rutas') = 'array'
ON CONFLICT ("folderRel") DO NOTHING;
