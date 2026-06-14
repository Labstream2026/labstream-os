-- Estados y prioridades de tarea personalizables (con color de 20 tonos).
-- Convierte Task.status, Task.priority y Project.priority de enum a TEXT
-- preservando los datos existentes, y añade la tabla WorkflowLabel sembrada
-- con los valores por defecto actuales.

-- 1) Convertir columnas enum → TEXT (sin pérdida de datos)
ALTER TABLE "Task" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "status" SET DATA TYPE TEXT USING "status"::text;
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'PENDIENTE';

ALTER TABLE "Task" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "priority" SET DATA TYPE TEXT USING "priority"::text;
ALTER TABLE "Task" ALTER COLUMN "priority" SET DEFAULT 'MEDIA';

ALTER TABLE "Project" ALTER COLUMN "priority" DROP DEFAULT;
ALTER TABLE "Project" ALTER COLUMN "priority" SET DATA TYPE TEXT USING "priority"::text;
ALTER TABLE "Project" ALTER COLUMN "priority" SET DEFAULT 'MEDIA';

-- 2) Eliminar los enums ya sin uso
DROP TYPE "TaskStatus";
DROP TYPE "Priority";

-- 3) Nueva tabla de etiquetas configurables
CREATE TYPE "WorkflowLabelKind" AS ENUM ('TASK_STATUS', 'TASK_PRIORITY');

CREATE TABLE "WorkflowLabel" (
    "id" TEXT NOT NULL,
    "kind" "WorkflowLabelKind" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkflowLabel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowLabel_kind_key_key" ON "WorkflowLabel"("kind", "key");
CREATE INDEX "WorkflowLabel_kind_position_idx" ON "WorkflowLabel"("kind", "position");

-- 4) Sembrar los valores por defecto (los actuales fijos en código)
INSERT INTO "WorkflowLabel" ("id","kind","key","label","color","position","isDefault","isDone") VALUES
('wl_st_pendiente','TASK_STATUS','PENDIENTE','Pendiente','slate',0,true,false),
('wl_st_proceso','TASK_STATUS','EN_PROCESO','En proceso','blue',1,false,false),
('wl_st_espera','TASK_STATUS','EN_ESPERA','En espera','amber',2,false,false),
('wl_st_revision','TASK_STATUS','EN_REVISION','En revisión','violet',3,false,false),
('wl_st_completada','TASK_STATUS','COMPLETADA','Completada','emerald',4,false,true),
('wl_st_cancelada','TASK_STATUS','CANCELADA','Cancelada','rose',5,false,true),
('wl_pr_baja','TASK_PRIORITY','BAJA','Baja','slate',0,false,false),
('wl_pr_media','TASK_PRIORITY','MEDIA','Media','blue',1,true,false),
('wl_pr_alta','TASK_PRIORITY','ALTA','Alta','amber',2,false,false),
('wl_pr_urgente','TASK_PRIORITY','URGENTE','Urgente','rose',3,false,false)
ON CONFLICT ("kind","key") DO NOTHING;
