-- Wiki en 4 secciones: flag de invitado, tablas globales con key, y bóveda de
-- credenciales con permisos por ítem. Cambios aditivos (sin pérdida de datos).

-- 1) Invitado puntual (sin acceso a la Wiki).
ALTER TABLE "User" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- 2) Tablas globales únicas de la wiki (Inventario, Ubicación).
ALTER TABLE "DataTable" ADD COLUMN "key" TEXT;
CREATE UNIQUE INDEX "DataTable_key_key" ON "DataTable"("key");

-- 3) Credenciales (bóveda) + lista de visores por credencial.
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "username" TEXT,
    "secretEnc" TEXT NOT NULL,
    "url" TEXT,
    "notes" TEXT,
    "ownerUserId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Credential_category_idx" ON "Credential"("category");

CREATE TABLE "CredentialViewer" (
    "credentialId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "CredentialViewer_pkey" PRIMARY KEY ("credentialId", "userId")
);
CREATE INDEX "CredentialViewer_userId_idx" ON "CredentialViewer"("userId");

ALTER TABLE "Credential" ADD CONSTRAINT "Credential_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CredentialViewer" ADD CONSTRAINT "CredentialViewer_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "Credential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CredentialViewer" ADD CONSTRAINT "CredentialViewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
