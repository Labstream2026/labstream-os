-- CreateTable
CREATE TABLE "ThreadRead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rootId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThreadRead_userId_rootId_key" ON "ThreadRead"("userId", "rootId");

-- CreateIndex
CREATE INDEX "ThreadRead_userId_idx" ON "ThreadRead"("userId");

-- AddForeignKey
ALTER TABLE "ThreadRead" ADD CONSTRAINT "ThreadRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
