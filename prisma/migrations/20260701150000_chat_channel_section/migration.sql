-- Un grupo de chat (GENERAL) se puede ASIGNAR a una sección/dependencia de la app (wiki,
-- biblioteca, reportes, cotizaciones, calendario). Al asignarlo, solo se pueden añadir/etiquetar
-- personas con acceso a esa sección. null = grupo/canal normal.
ALTER TABLE "ChatChannel" ADD COLUMN "section" TEXT;
