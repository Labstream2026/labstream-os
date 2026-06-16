-- Nombre del autor sin cuenta en el registro de actividad (cliente desde el portal)
ALTER TABLE "ActivityLog" ADD COLUMN "actorName" TEXT;
