-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "forUserId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "taskId" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'UNA_VEZ',
    "weekdays" TEXT,
    "dayOfMonth" INTEGER,
    "timeOfDay" TEXT NOT NULL DEFAULT '08:00',
    "nextFireAt" TIMESTAMP(3) NOT NULL,
    "lastFiredAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_active_nextFireAt_idx" ON "Reminder"("active", "nextFireAt");

-- CreateIndex
CREATE INDEX "Reminder_forUserId_active_idx" ON "Reminder"("forUserId", "active");

-- CreateIndex
CREATE INDEX "Reminder_taskId_idx" ON "Reminder"("taskId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_forUserId_fkey" FOREIGN KEY ("forUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
