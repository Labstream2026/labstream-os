-- Ajustes globales de la app (clave → valor JSON), p. ej. el candado
-- «no Terminar un proyecto sin respaldo registrado». Aditiva.
CREATE TABLE "AppConfig" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);
