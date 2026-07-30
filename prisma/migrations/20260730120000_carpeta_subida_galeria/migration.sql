-- Carpeta de la galería donde cae lo que sube el cliente por el enlace público /subir/[token].
-- Aparte de "galeriaFolder" (la de ENTREGAS del proyecto): lo que el cliente manda no se mezcla
-- con lo que le entregamos. Null = comportamiento de antes (disco de la app, STORAGE_DIR).
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "uploadGaleriaFolder" TEXT;
