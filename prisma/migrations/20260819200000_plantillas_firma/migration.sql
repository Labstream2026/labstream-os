-- Plantillas de FIRMA del estudio: la firma corporativa se estructura una vez (layout, logo,
-- colores) con {{nombre}} y {{cargo}}, y cada colaborador solo pone su nombre y su cargo.

-- CreateTable
CREATE TABLE "MailSignatureTemplate" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "imageBytes" BYTEA,
    "imageMime" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailSignatureTemplate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN "signatureTemplateId" TEXT,
ADD COLUMN "signatureName" TEXT,
ADD COLUMN "signatureRole" TEXT;

-- AddForeignKey
ALTER TABLE "MailSignatureTemplate" ADD CONSTRAINT "MailSignatureTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAccount" ADD CONSTRAINT "MailAccount_signatureTemplateId_fkey" FOREIGN KEY ("signatureTemplateId") REFERENCES "MailSignatureTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
