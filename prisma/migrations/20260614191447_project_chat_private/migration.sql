-- El chat de cada proyecto pasa a ser PRIVADO (por invitación). Para no dejar
-- fuera a quien ya colaboraba, se siembra la membresía del canal con el
-- responsable (como ADMIN del chat) y los miembros actuales del proyecto.

-- 1) Todos los canales de proyecto → privados.
UPDATE "ChatChannel" SET "isPublic" = false WHERE "type" = 'PROJECT';

-- 2) El responsable del proyecto entra como administrador del chat.
INSERT INTO "ChannelMember" ("channelId", "userId", "role", "createdAt")
SELECT c."id", p."leadId", 'ADMIN', NOW()
FROM "ChatChannel" c
JOIN "Project" p ON p."id" = c."projectId"
WHERE c."type" = 'PROJECT' AND p."leadId" IS NOT NULL
ON CONFLICT ("channelId", "userId") DO NOTHING;

-- 3) Los miembros actuales del proyecto entran como participantes del chat.
INSERT INTO "ChannelMember" ("channelId", "userId", "role", "createdAt")
SELECT c."id", pm."userId", 'MEMBER', NOW()
FROM "ChatChannel" c
JOIN "ProjectMember" pm ON pm."projectId" = c."projectId"
WHERE c."type" = 'PROJECT'
ON CONFLICT ("channelId", "userId") DO NOTHING;
