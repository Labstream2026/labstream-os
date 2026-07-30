-- La RAÍZ de cada disco: qué montaje de la app es (OPS = Operaciones_LAB,
-- GALERIA = Entregas_LAB) o NULL = disco de cajón, que no se puede leer en vivo.
ALTER TABLE "StorageDisk" ADD COLUMN "mountKey" TEXT;

-- Backfill: el disco que hoy dice «Es el NAS» pasa a ser el montaje de Operaciones_LAB.
-- Si hubiera MÁS de uno marcado (el bug que inflaba el espacio libre al doble), solo el más
-- antiguo se queda con el montaje; los demás conservan sus datos y quedan sin raíz.
UPDATE "StorageDisk" SET "mountKey" = 'OPS'
WHERE "id" = (
  SELECT "id" FROM "StorageDisk" WHERE "isNas" = true ORDER BY "createdAt" ASC LIMIT 1
);

-- Un montaje pertenece a UN disco (varios NULL conviven: los discos de cajón).
CREATE UNIQUE INDEX "StorageDisk_mountKey_key" ON "StorageDisk"("mountKey");

-- isNas queda como espejo de mountKey para no romper lecturas viejas.
UPDATE "StorageDisk" SET "isNas" = ("mountKey" = 'OPS');

-- Caducidades del material: se escribían a medianoche UTC, que en Bogotá son las 7 de la
-- tarde del día ANTERIOR. Por eso el informe CSV (que formatea en hora de Bogotá) imprimía
-- un día menos que la pantalla, y «vence hoy» se volvía «venció ayer» cada tarde. Se
-- recolocan a medianoche de Bogotá del MISMO día calendario que alguien escribió; así todos
-- los lectores —en hora local o en UTC— coinciden en el día. Solo toca las filas que están
-- exactamente a medianoche UTC (las escritas por el formulario).
UPDATE "MaterialLocation"
SET "expiresAt" = "expiresAt" + INTERVAL '5 hours'
WHERE "expiresAt" IS NOT NULL
  AND EXTRACT(HOUR FROM ("expiresAt" AT TIME ZONE 'UTC')) = 0
  AND EXTRACT(MINUTE FROM ("expiresAt" AT TIME ZONE 'UTC')) = 0;
