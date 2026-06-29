-- Hora de finalización opcional de la tarea ("HH:mm", hora de pared). Permite mostrarla en el
-- calendario a una hora concreta en vez de "todo el día".
ALTER TABLE "Task" ADD COLUMN "dueTime" TEXT;
