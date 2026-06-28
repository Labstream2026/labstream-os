-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserNotificationPref" (
    "userId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserNotificationPref_pkey" PRIMARY KEY ("userId","eventKey")
);

-- CreateIndex
CREATE INDEX "UserNotificationPref_userId_idx" ON "UserNotificationPref"("userId");

-- AddForeignKey
ALTER TABLE "UserNotificationPref" ADD CONSTRAINT "UserNotificationPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
