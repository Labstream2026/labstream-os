-- Rastreador: tramos de INACTIVIDAD en tabla aparte (no una bandera en WorkBlock, para que
-- ninguna suma de horas efectivas pueda tragárselos por accidente).

-- CreateTable
CREATE TABLE "IdleBlock" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "seconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdleBlock_deviceId_startedAt_key" ON "IdleBlock"("deviceId", "startedAt");

-- CreateIndex
CREATE INDEX "IdleBlock_userId_startedAt_idx" ON "IdleBlock"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "IdleBlock" ADD CONSTRAINT "IdleBlock_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "TrackerDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdleBlock" ADD CONSTRAINT "IdleBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
