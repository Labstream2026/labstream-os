-- Historial de la Wiki: cada guardado deja atrás la versión anterior, recuperable.
-- Y sello del aviso al dueño cuando su página vence (para no repetirlo cada día).
-- TODO ADITIVO: una tabla nueva y una columna nullable. No toca ni una fila existente,
-- así que el `prisma migrate deploy` del arranque no puede fallar por datos.

ALTER TABLE "WikiPage" ADD COLUMN "staleNotifiedAt" TIMESTAMP(3);

CREATE TABLE "WikiRevision" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "section" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "icon" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WikiRevision_pageId_createdAt_idx" ON "WikiRevision"("pageId", "createdAt");

ALTER TABLE "WikiRevision" ADD CONSTRAINT "WikiRevision_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WikiRevision" ADD CONSTRAINT "WikiRevision_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
