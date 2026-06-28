-- CreateTable
CREATE TABLE "HiggsfieldAuth" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "clientId" TEXT,
    "refreshTokenEnc" TEXT,
    "connectedById" TEXT,
    "connectedByName" TEXT,
    "connectedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HiggsfieldAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaJob" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'video',
    "prompt" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'higgsfield',
    "providerJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "resultUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaJob_status_idx" ON "MediaJob"("status");
