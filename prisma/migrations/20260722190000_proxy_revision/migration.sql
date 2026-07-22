-- Proxy de revisión: copia 1080p H.264 generada por el servidor junto al original.
-- La sala de revisión la reproduce cuando existe; el original queda para descarga.
-- Aditivo (columna nullable): no toca datos existentes.

ALTER TABLE "DeliverableVersion" ADD COLUMN "proxyRel" TEXT;
