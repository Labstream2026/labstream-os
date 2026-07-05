-- Los enlaces de una tarea pasan a vivir como ARCHIVOS del proyecto (FileAsset) ligados a la tarea:
-- aparecen en Archivos con el chip de su tarea y el cliente los ve. Reemplaza el modelo TaskLink.

-- FileAsset ligado a una tarea (SetNull: si la tarea se borra, la referencia se conserva en Archivos).
ALTER TABLE "FileAsset" ADD COLUMN "taskId" TEXT;

-- CreateIndex
CREATE INDEX "FileAsset_taskId_idx" ON "FileAsset"("taskId");

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Se jubila TaskLink: los enlaces de tarea ahora son FileAsset. La tabla se creó hoy y está vacía.
DROP TABLE "TaskLink";
