-- Portada tipo Notion en la ficha del cliente: encuadre vertical elegido arrastrando la imagen
-- (0-100 = porcentaje de object-position Y; NULL = centrada). Aditiva e inofensiva.
ALTER TABLE "Client" ADD COLUMN "bannerPosY" INTEGER;
