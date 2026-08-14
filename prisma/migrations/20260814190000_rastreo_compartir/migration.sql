-- Compartir el rastreo de UNA persona con otro miembro del equipo. El acceso amplio (ver a
-- todos) lo da el permiso `ver_rastreo`; esta tabla es el nivel fino: un visor, un sujeto,
-- opcionalmente con fecha de vencimiento. Nunca es un enlace público.

-- CreateTable
CREATE TABLE "TrackerShare" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "grantedById" TEXT,
    "nota" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackerShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackerShare_viewerId_subjectId_key" ON "TrackerShare"("viewerId", "subjectId");

-- CreateIndex
CREATE INDEX "TrackerShare_subjectId_idx" ON "TrackerShare"("subjectId");

-- AddForeignKey
ALTER TABLE "TrackerShare" ADD CONSTRAINT "TrackerShare_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerShare" ADD CONSTRAINT "TrackerShare_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackerShare" ADD CONSTRAINT "TrackerShare_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
