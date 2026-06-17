-- Catálogo interno de servicios (lista de precios estandarizada) + ajustes de cotización.
CREATE TABLE "ServiceItem" (
  "id" TEXT NOT NULL,
  "serviceType" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "detail" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'servicio',
  "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "position" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceItem_serviceType_idx" ON "ServiceItem"("serviceType");

CREATE TABLE "QuoteSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "iva" INTEGER NOT NULL DEFAULT 19,
  "contingencyPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "contingencyLabel" TEXT NOT NULL DEFAULT 'Transporte e imprevistos',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteSettings_pkey" PRIMARY KEY ("id")
);
