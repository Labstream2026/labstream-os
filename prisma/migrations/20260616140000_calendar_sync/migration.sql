-- Sincronización bidireccional con Synology Calendar (CalDAV).

-- Campos de sync en CalendarEvent.
ALTER TABLE "CalendarEvent" ADD COLUMN "location" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "uid" TEXT;
ALTER TABLE "CalendarEvent" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'app';
ALTER TABLE "CalendarEvent" ADD COLUMN "syncedAt" TIMESTAMP(3);
ALTER TABLE "CalendarEvent" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "CalendarEvent_uid_key" ON "CalendarEvent" ("uid");

-- Copia por usuario de cada evento en su colección CalDAV (href + etag).
CREATE TABLE "EventSyncRef" (
  "id"      TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId"  TEXT NOT NULL,
  "href"    TEXT NOT NULL,
  "etag"    TEXT,
  CONSTRAINT "EventSyncRef_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventSyncRef_eventId_userId_key" ON "EventSyncRef" ("eventId", "userId");
CREATE INDEX "EventSyncRef_userId_idx" ON "EventSyncRef" ("userId");
ALTER TABLE "EventSyncRef" ADD CONSTRAINT "EventSyncRef_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventSyncRef" ADD CONSTRAINT "EventSyncRef_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Conexión CalDAV por usuario (credenciales cifradas).
CREATE TABLE "CalendarConnection" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "serverUrl"    TEXT NOT NULL,
  "username"     TEXT NOT NULL,
  "passwordEnc"  TEXT NOT NULL,
  "calendarUrl"  TEXT,
  "calendarName" TEXT,
  "syncToken"    TEXT,
  "enabled"      BOOLEAN NOT NULL DEFAULT true,
  "lastSyncAt"   TIMESTAMP(3),
  "lastError"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarConnection_userId_key" ON "CalendarConnection" ("userId");
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
