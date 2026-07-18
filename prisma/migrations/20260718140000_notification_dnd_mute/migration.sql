-- AlterTable: No molestar (dndUntil) + horario silencioso (quietStart/quietEnd)
ALTER TABLE "User" ADD COLUMN     "dndUntil" TIMESTAMP(3),
ADD COLUMN     "quietStart" INTEGER,
ADD COLUMN     "quietEnd" INTEGER;

-- CreateTable: silenciar por proyecto o persona
CREATE TABLE "NotificationMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationMute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationMute_userId_kind_targetId_key" ON "NotificationMute"("userId", "kind", "targetId");

-- CreateIndex
CREATE INDEX "NotificationMute_userId_idx" ON "NotificationMute"("userId");

-- AddForeignKey
ALTER TABLE "NotificationMute" ADD CONSTRAINT "NotificationMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
