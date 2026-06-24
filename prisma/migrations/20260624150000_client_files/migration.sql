-- Archivos/referencias a nivel de cliente (enlaces + rutas SMB). Aditivo y seguro: tabla nueva,
-- sin tocar datos existentes. Reutiliza el enum FileKind ya existente.
CREATE TABLE "ClientFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL DEFAULT 'LINK',
    "url" TEXT,
    "path" TEXT,
    "clientId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientFile_clientId_idx" ON "ClientFile"("clientId");

ALTER TABLE "ClientFile" ADD CONSTRAINT "ClientFile_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientFile" ADD CONSTRAINT "ClientFile_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
