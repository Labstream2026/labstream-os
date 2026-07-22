-- Portal del cliente: «qué sigue» editable, solicitudes al equipo, encuesta al terminar
-- y marca del resumen semanal. TODO aditivo (sin tocar datos existentes).

ALTER TABLE "Project" ADD COLUMN "nextForClient" TEXT;
ALTER TABLE "User" ADD COLUMN "clientDigestAt" TIMESTAMP(3);

CREATE TABLE "ClientRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECIBIDA',
    "responseNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientRequest_projectId_status_idx" ON "ClientRequest"("projectId", "status");
CREATE INDEX "ClientRequest_createdById_createdAt_idx" ON "ClientRequest"("createdById", "createdAt");

ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProjectSurvey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSurvey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectSurvey_projectId_userId_key" ON "ProjectSurvey"("projectId", "userId");

ALTER TABLE "ProjectSurvey" ADD CONSTRAINT "ProjectSurvey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
