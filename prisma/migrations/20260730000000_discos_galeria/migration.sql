-- Discos: la galería de entregas (LabTem) se conecta con clientes, proyectos y entregables.
-- Todo aditivo; no toca datos existentes.

-- Carpeta del cliente en la galería (todo su material cuelga de aquí, subcarpeta por proyecto).
ALTER TABLE "Client" ADD COLUMN "galeriaFolder" TEXT;

-- Carpeta del proyecto en la galería (gemela de opsFolder; heredada de la del cliente si falta).
ALTER TABLE "Project" ADD COLUMN "galeriaFolder" TEXT;

-- Archivo VIVO en la galería: FileAsset.path = ruta relativa a NAS_GALERIA_DIR.
-- (Postgres: un valor nuevo de enum no puede USARSE en la misma transacción que lo crea;
-- esta migración no inserta filas, así que no hay problema — mismo patrón que 'OPS'.)
ALTER TYPE "FileKind" ADD VALUE 'GALERIA';
