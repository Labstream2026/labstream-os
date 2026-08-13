-- Rastreador de trabajo efectivo (Fase 1): equipos vinculados + bloques de uso.

-- CreateTable
CREATE TABLE "TrackerDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "platform" TEXT,
    "appVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "TrackerDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkBlock" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "seconds" INTEGER NOT NULL,
    "activeSecs" INTEGER NOT NULL,
    "app" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackerDevice_tokenHash_key" ON "TrackerDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TrackerDevice_userId_idx" ON "TrackerDevice"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkBlock_deviceId_startedAt_app_title_key" ON "WorkBlock"("deviceId", "startedAt", "app", "title");

-- CreateIndex
CREATE INDEX "WorkBlock_userId_startedAt_idx" ON "WorkBlock"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "TrackerDevice" ADD CONSTRAINT "TrackerDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkBlock" ADD CONSTRAINT "WorkBlock_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TrackerDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkBlock" ADD CONSTRAINT "WorkBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
