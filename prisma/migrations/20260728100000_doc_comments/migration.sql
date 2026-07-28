-- Comentarios dentro de los documentos de Office + quién los tiene abiertos.
-- Aditiva: no toca ninguna tabla existente.

CREATE TABLE "DocComment" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "extId" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "at" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocComment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocComment_fileId_extId_key" ON "DocComment"("fileId", "extId");
CREATE INDEX "DocComment_fileId_resolved_idx" ON "DocComment"("fileId", "resolved");

ALTER TABLE "DocComment" ADD CONSTRAINT "DocComment_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocComment" ADD CONSTRAINT "DocComment_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DocPresence" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocPresence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocPresence_fileId_userId_key" ON "DocPresence"("fileId", "userId");
CREATE INDEX "DocPresence_fileId_idx" ON "DocPresence"("fileId");

ALTER TABLE "DocPresence" ADD CONSTRAINT "DocPresence_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocPresence" ADD CONSTRAINT "DocPresence_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
