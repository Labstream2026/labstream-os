-- Borra los canales de cliente-empresa (tipo CLIENT) — decisión del 2026-07-19: el chat queda
-- solo en proyectos, generales, equipos por rol y DMs. Por cascada de BD se van también sus
-- mensajes, adjuntos, reacciones, encuestas, miembros y estados de lectura. Los documentos ya
-- espejados en Archivos (FileAsset) NO se tocan: viven aparte y se conservan.
DELETE FROM "ChatChannel" WHERE "type" = 'CLIENT';
