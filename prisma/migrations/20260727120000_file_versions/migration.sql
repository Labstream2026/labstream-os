-- Historial de versiones de un documento editado en OnlyOffice. Antes, cada guardado
-- SOBRESCRIBÍA el archivo y la versión anterior desaparecía: si alguien borraba media página
-- y cerraba, no había a qué volver. Ahora, antes de escribir, se guarda una copia aquí.
CREATE TABLE "FileVersion" (
  "id"          TEXT NOT NULL,
  "fileId"      TEXT NOT NULL,
  "version"     INTEGER NOT NULL,   -- número que tenía el archivo ANTES de este guardado
  "path"        TEXT NOT NULL,      -- copia en el storage
  "size"        INTEGER NOT NULL,
  "savedByName" TEXT,               -- quién estaba editando al guardar (lo dice OnlyOffice)
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FileVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FileVersion_fileId_version_idx" ON "FileVersion"("fileId", "version" DESC);

-- Si el archivo se elimina, su historial se va con él.
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_fileId_fkey"
  FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
