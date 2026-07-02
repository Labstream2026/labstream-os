-- Respuesta del equipo dirigida al cliente (replyToReview): visible en el portal público,
-- a diferencia de los comentarios internos de pre-aprobación.
ALTER TABLE "ReviewComment" ADD COLUMN "visibleToClient" BOOLEAN NOT NULL DEFAULT false;
