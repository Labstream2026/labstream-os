-- Marcebot fuera de las conversaciones.
--
-- Barrido de una vez: oculta los mensajes que el bot dejó en los chats (el pulso «📣 …», los
-- resúmenes, los avisos sueltos). Es el mismo borrado SUAVE que usa el botón de /ajustes →
-- Mantenimiento: la fila se queda, solo se marca `deletedAt`, y todas las consultas del chat
-- filtran por `deletedAt IS NULL`. Deshacerlo es un UPDATE poniendo la columna a NULL.
--
-- No entran los mensajes CON ADJUNTO: ahí el bot entregó algo que alguien le pidió (un video,
-- una imagen, una cotización) y eso no es ruido. Tampoco se toca ninguna notificación ni el
-- registro de actividad: viven en otras tablas.
UPDATE "ChatMessage" m
SET "deletedAt" = NOW()
FROM "User" u
WHERE m."authorId" = u."id"
  AND u."isSystemBot" = true
  AND m."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "MessageAttachment" a WHERE a."messageId" = m."id");

-- Y el interruptor para que no vuelvan: el espejo del pulso en el chat de la cuenta del cliente
-- era lo único que aún escribía mensajes del bot en un canal. Se puede apagar en /ajustes.
INSERT INTO "AppConfig" ("key", "value", "updatedAt")
VALUES ('chat.marcebotSilencio', 'true'::jsonb, NOW())
ON CONFLICT ("key") DO NOTHING;
