-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "briefDeliverables" TEXT,
ADD COLUMN     "briefScope" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "contingencyPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "deliverables" TEXT,
ADD COLUMN     "scope" TEXT;

-- AlterTable
ALTER TABLE "QuoteItem" ADD COLUMN     "catalogItemId" TEXT,
ADD COLUMN     "unit" TEXT;
