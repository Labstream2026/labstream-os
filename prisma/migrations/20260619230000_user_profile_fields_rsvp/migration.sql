-- Datos del colaborador (editables en el perfil): documento, EPS, ARL y fecha de nacimiento.
ALTER TABLE "User" ADD COLUMN "cedula" TEXT;
ALTER TABLE "User" ADD COLUMN "eps" TEXT;
ALTER TABLE "User" ADD COLUMN "arl" TEXT;
ALTER TABLE "User" ADD COLUMN "birthDate" TIMESTAMP(3);

-- RSVP: respuesta del asistente a una cita (PENDING | ACCEPTED | DECLINED | TENTATIVE).
ALTER TABLE "CalendarAttendee" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';
