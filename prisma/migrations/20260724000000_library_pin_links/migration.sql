-- Biblioteca · Recursos 2.0: fijados + vínculo opcional a proyecto/cliente.
-- Aditiva: solo columnas nuevas con default o null en LibraryAsset.
ALTER TABLE "LibraryAsset" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LibraryAsset" ADD COLUMN "projectId" TEXT;
ALTER TABLE "LibraryAsset" ADD COLUMN "clientId" TEXT;

ALTER TABLE "LibraryAsset" ADD CONSTRAINT "LibraryAsset_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryAsset" ADD CONSTRAINT "LibraryAsset_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LibraryAsset_projectId_idx" ON "LibraryAsset"("projectId");
CREATE INDEX "LibraryAsset_clientId_idx" ON "LibraryAsset"("clientId");
