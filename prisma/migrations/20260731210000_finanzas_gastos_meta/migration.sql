-- Centro Finanzas: registro propio de gastos + meta mensual + marca del aviso de cartera.
-- Todo ADITIVO: columnas nuevas nullable y una tabla nueva — cero riesgo para lo existente.

ALTER TABLE "OrgSettings" ADD COLUMN IF NOT EXISTS "metaFacturacion" INTEGER;
ALTER TABLE "OrgSettings" ADD COLUMN IF NOT EXISTS "carteraAvisadaEl" TEXT;

CREATE TABLE IF NOT EXISTS "Gasto" (
    "id" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "concepto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "monto" INTEGER NOT NULL,
    "nota" TEXT,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Gasto_fecha_idx" ON "Gasto"("fecha");

ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
