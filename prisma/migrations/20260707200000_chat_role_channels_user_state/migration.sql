-- AlterTable
ALTER TABLE "ChatChannel" ADD COLUMN     "roleKey" TEXT;

-- CreateTable
CREATE TABLE "UserChannelState" (
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3),
    "lastReadAt" TIMESTAMP(3),
    "notifyLevel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserChannelState_pkey" PRIMARY KEY ("userId","channelId")
);

-- CreateIndex
CREATE INDEX "UserChannelState_channelId_idx" ON "UserChannelState"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_roleKey_key" ON "ChatChannel"("roleKey");

-- AddForeignKey
ALTER TABLE "UserChannelState" ADD CONSTRAINT "UserChannelState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChannelState" ADD CONSTRAINT "UserChannelState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

