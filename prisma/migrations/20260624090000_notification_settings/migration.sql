-- Interruptor por tipo de notificación (global, gestionado por el admin). Aditivo y seguro:
-- tabla nueva, sin tocar datos existentes. Por defecto todo activo (ausencia de fila = habilitado).
CREATE TABLE "NotificationSetting" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("key")
);
