-- Invitados externos (por correo) a un evento de calendario.
CREATE TABLE "EventGuest" (
  "id"      TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "email"   TEXT NOT NULL,
  "name"    TEXT,
  CONSTRAINT "EventGuest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventGuest_eventId_email_key" ON "EventGuest" ("eventId", "email");
CREATE INDEX "EventGuest_eventId_idx" ON "EventGuest" ("eventId");
ALTER TABLE "EventGuest" ADD CONSTRAINT "EventGuest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
