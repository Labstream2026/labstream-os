-- AlterTable
ALTER TABLE "QuoteItem" ADD COLUMN     "section" TEXT;

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");
