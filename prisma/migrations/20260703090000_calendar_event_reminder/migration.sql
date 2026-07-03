-- Recordatorio configurable por cita (minutos antes) + marca anti-duplicado del aviso.
ALTER TABLE "CalendarEvent" ADD COLUMN "reminderMinutes" INTEGER DEFAULT 15;
ALTER TABLE "CalendarEvent" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
