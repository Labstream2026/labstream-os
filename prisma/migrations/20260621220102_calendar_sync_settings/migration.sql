-- CreateTable
CREATE TABLE "CalendarSyncSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "everyMinutes" INTEGER NOT NULL DEFAULT 15,
    "startHour" INTEGER NOT NULL DEFAULT 8,
    "endHour" INTEGER NOT NULL DEFAULT 18,
    "workDays" TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
    "lastRunAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSyncSettings_pkey" PRIMARY KEY ("id")
);
