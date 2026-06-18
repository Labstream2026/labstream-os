-- Configuración editable de Marcebot (fila única "default").
CREATE TABLE "MarcebotConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "workDays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "startHour" INTEGER NOT NULL DEFAULT 7,
    "lastHour" INTEGER NOT NULL DEFAULT 16,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarcebotConfig_pkey" PRIMARY KEY ("id")
);
