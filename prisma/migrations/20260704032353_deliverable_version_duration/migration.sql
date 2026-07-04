-- Duración del video (segundos), capturada en el cliente al subir la versión.
ALTER TABLE "DeliverableVersion" ADD COLUMN "durationSec" INTEGER;
