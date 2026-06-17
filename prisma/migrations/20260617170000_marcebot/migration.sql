-- Marcebot: género para el saludo + bandera de usuario de sistema + estado anti-spam.
ALTER TABLE "User" ADD COLUMN "gender" TEXT;
ALTER TABLE "User" ADD COLUMN "isSystemBot" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "MarcebotState" (
    "userId" TEXT NOT NULL,
    "lastDigest" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "lastMorningOn" TEXT,
    "lastTeamDigest" TEXT,
    "lastTeamOn" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarcebotState_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "MarcebotState" ADD CONSTRAINT "MarcebotState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
