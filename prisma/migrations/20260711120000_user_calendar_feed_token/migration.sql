-- Feed de suscripción de calendario por usuario: un token secreto que sirve un .ics de solo
-- lectura (webcal) para que Google/Apple/Outlook se suscriban al calendario personal de la app.
-- null = feed sin generar; rotar el token revoca el enlace anterior.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "calendarFeedToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_calendarFeedToken_key" ON "User"("calendarFeedToken");
