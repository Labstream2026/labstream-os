-- La hora de entrega ahora es obligatoria. A las tareas YA creadas que tienen fecha de entrega
-- pero no hora, se les pone 9:00 am en su día de entrega. Idempotente: solo afecta las que
-- aún no tienen hora.
UPDATE "Task" SET "dueTime" = '09:00' WHERE "dueDate" IS NOT NULL AND "dueTime" IS NULL;
