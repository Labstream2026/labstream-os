-- Los proyectos pasan a ser PRIVADOS por defecto (membresía): un usuario nuevo
-- arranca sin proyectos. Se ponen en privado los existentes para cerrar la fuga
-- por la que cualquiera con ver_proyectos veía todos los proyectos públicos.
-- El admin sigue viéndolos todos; el responsable y los miembros, los suyos.
ALTER TABLE "Project" ALTER COLUMN "isPrivate" SET DEFAULT true;
UPDATE "Project" SET "isPrivate" = true WHERE "isPrivate" = false;
