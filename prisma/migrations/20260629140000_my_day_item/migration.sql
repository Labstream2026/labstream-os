-- CreateTable
CREATE TABLE "MyDayItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MyDayItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MyDayItem_userId_idx" ON "MyDayItem"("userId");

-- CreateIndex
CREATE INDEX "MyDayItem_taskId_idx" ON "MyDayItem"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "MyDayItem_userId_taskId_key" ON "MyDayItem"("userId", "taskId");

-- AddForeignKey
ALTER TABLE "MyDayItem" ADD CONSTRAINT "MyDayItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MyDayItem" ADD CONSTRAINT "MyDayItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

