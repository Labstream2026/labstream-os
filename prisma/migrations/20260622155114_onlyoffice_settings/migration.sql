CREATE TABLE "OnlyOfficeSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "docsUrl" TEXT,
    "jwtSecretEnc" TEXT,
    "callbackBase" TEXT,
    "internalUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnlyOfficeSettings_pkey" PRIMARY KEY ("id")
);
