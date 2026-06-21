-- CreateTable
CREATE TABLE "OpenClawSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "baseUrl" TEXT,
    "tokenEnc" TEXT,
    "agentModel" TEXT NOT NULL DEFAULT 'openclaw',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenClawSettings_pkey" PRIMARY KEY ("id")
);
