-- Biblioteca · Discos y mapa del material: en qué disco vive el material de cada
-- proyecto (bruto/edición/exportes/respaldo) y su salud de respaldo 3-2-1.
-- Aditiva: dos tablas nuevas, nada existente cambia.
CREATE TABLE "StorageDisk" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'HDD',
    "color" TEXT,
    "capacityGB" INTEGER,
    "usedGB" INTEGER,
    "location" TEXT,
    "offsite" BOOLEAN NOT NULL DEFAULT false,
    "isNas" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVO',
    "notes" TEXT,
    "lastCheckAt" TIMESTAMP(3),
    "checkNotifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageDisk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorageDisk_status_idx" ON "StorageDisk"("status");

ALTER TABLE "StorageDisk" ADD CONSTRAINT "StorageDisk_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MaterialLocation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "diskId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "path" TEXT,
    "notes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialLocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialLocation_projectId_diskId_role_key" ON "MaterialLocation"("projectId", "diskId", "role");
CREATE INDEX "MaterialLocation_projectId_idx" ON "MaterialLocation"("projectId");
CREATE INDEX "MaterialLocation_diskId_idx" ON "MaterialLocation"("diskId");

ALTER TABLE "MaterialLocation" ADD CONSTRAINT "MaterialLocation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialLocation" ADD CONSTRAINT "MaterialLocation_diskId_fkey"
  FOREIGN KEY ("diskId") REFERENCES "StorageDisk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialLocation" ADD CONSTRAINT "MaterialLocation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
