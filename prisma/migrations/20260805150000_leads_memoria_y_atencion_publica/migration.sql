-- Prospectos, memoria del asistente por persona y atención a desconocidos.
--
-- Puramente ADITIVA: dos tablas nuevas y una columna nueva con valor por defecto. No toca ni
-- una fila existente, así que aplicarla en producción no cambia nada hasta que alguien encienda
-- `publicIntake` en una llave o el asistente escriba el primer recuerdo.

-- Prospecto: alguien que aún no es cliente y escribió preguntando. Isla a propósito: sin FK a
-- proyectos ni cotizaciones. Solo `atendidoPorId` apunta al equipo, y con RESTRICT para que
-- borrar a una persona no se lleve por delante el rastro comercial.
CREATE TABLE IF NOT EXISTS "Lead" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "empresa" TEXT,
    "interes" TEXT,
    "mensaje" TEXT,
    "presupuesto" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "estado" TEXT NOT NULL DEFAULT 'NUEVO',
    "notaInterna" TEXT,
    "atendidoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Lead_estado_createdAt_idx" ON "Lead"("estado", "createdAt");
CREATE INDEX IF NOT EXISTS "Lead_telefono_idx" ON "Lead"("telefono");

-- Memoria del asistente por persona. La unicidad (userId, clave) es lo que permite REESCRIBIR
-- un recuerdo en vez de acumular versiones que se contradicen.
CREATE TABLE IF NOT EXISTS "AgentMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'whatsapp',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentMemory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentMemory_userId_clave_key" ON "AgentMemory"("userId", "clave");
CREATE INDEX IF NOT EXISTS "AgentMemory_userId_updatedAt_idx" ON "AgentMemory"("userId", "updatedAt");

-- Interruptor de atención a desconocidos. Apagado por defecto: el canal sigue siendo solo-equipo
-- hasta que alguien lo encienda a conciencia sobre una llave de pasarela concreta.
ALTER TABLE "AppKey" ADD COLUMN IF NOT EXISTS "publicIntake" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
    ALTER TABLE "Lead" ADD CONSTRAINT "Lead_atendidoPorId_fkey" FOREIGN KEY ("atendidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "AgentMemory" ADD CONSTRAINT "AgentMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
