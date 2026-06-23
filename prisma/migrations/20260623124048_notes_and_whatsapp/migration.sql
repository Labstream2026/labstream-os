-- WhatsApp en User: número (recibir/identificar) + permiso de comandar al bot.
ALTER TABLE "User" ADD COLUMN "whatsappPhone" TEXT;
ALTER TABLE "User" ADD COLUMN "whatsappCommand" BOOLEAN NOT NULL DEFAULT false;

-- Notas del equipo.
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "source" TEXT NOT NULL DEFAULT 'app',
    "createdById" TEXT NOT NULL,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Note_createdById_idx" ON "Note"("createdById");
CREATE INDEX "Note_projectId_idx" ON "Note"("projectId");

ALTER TABLE "Note" ADD CONSTRAINT "Note_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
