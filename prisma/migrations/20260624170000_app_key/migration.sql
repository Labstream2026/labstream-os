-- Credencial de la API intermedia (/api/v1). Aditivo y seguro: tabla nueva, no toca datos.
CREATE TABLE "AppKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefixVisible" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdById" TEXT,
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 120,
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedIp" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppKey_prefixVisible_key" ON "AppKey"("prefixVisible");
CREATE INDEX "AppKey_userId_idx" ON "AppKey"("userId");
CREATE INDEX "AppKey_revoked_idx" ON "AppKey"("revoked");

ALTER TABLE "AppKey" ADD CONSTRAINT "AppKey_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
