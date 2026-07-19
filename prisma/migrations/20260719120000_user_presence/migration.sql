-- Estado de disponibilidad manual del usuario: "activo" | "ocupado" | "ausente" (null = activo).
-- Columna NULLABLE → la migración aplica siempre, sin conflicto con datos existentes.
ALTER TABLE "User" ADD COLUMN "presence" TEXT;
