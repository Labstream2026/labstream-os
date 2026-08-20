-- El cliente puede RAYAR una foto (anotación aplanada, como en video). El JPEG vive en el
-- storage interno (fotos-marcas/<photoId>.jpg); aquí solo el sello. Aditiva e idempotente.
ALTER TABLE "DeliverablePhoto" ADD COLUMN IF NOT EXISTS "drawnAt" TIMESTAMP(3);
