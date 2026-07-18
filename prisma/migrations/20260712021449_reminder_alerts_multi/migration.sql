-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "color" TEXT,
ADD COLUMN     "doneAt" TIMESTAMP(3),
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "firedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "maxFires" INTEGER,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "untilYmd" TEXT;

-- CreateTable
CREATE TABLE "ReminderAlert" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "fireAt" TIMESTAMP(3) NOT NULL,
    "offsetMin" INTEGER,
    "sentAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReminderAlert_active_sentAt_fireAt_idx" ON "ReminderAlert"("active", "sentAt", "fireAt");

-- CreateIndex
CREATE INDEX "ReminderAlert_reminderId_idx" ON "ReminderAlert"("reminderId");

-- CreateIndex
CREATE INDEX "Reminder_eventId_idx" ON "Reminder"("eventId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderAlert" ADD CONSTRAINT "ReminderAlert_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "Reminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
