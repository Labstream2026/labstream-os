-- Miembros de cliente: controla quién puede ver cada cliente.
CREATE TABLE "ClientMember" (
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientMember_pkey" PRIMARY KEY ("clientId","userId")
);

CREATE INDEX "ClientMember_userId_idx" ON "ClientMember"("userId");

ALTER TABLE "ClientMember" ADD CONSTRAINT "ClientMember_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientMember" ADD CONSTRAINT "ClientMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: para no perder acceso, todo el que hoy lidera o es miembro de algún
-- proyecto de un cliente queda como miembro explícito de ese cliente.
INSERT INTO "ClientMember" ("clientId", "userId")
SELECT DISTINCT p."clientId", p."leadId"
FROM "Project" p
WHERE p."leadId" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "ClientMember" ("clientId", "userId")
SELECT DISTINCT p."clientId", pm."userId"
FROM "ProjectMember" pm
JOIN "Project" p ON p."id" = pm."projectId"
ON CONFLICT DO NOTHING;
