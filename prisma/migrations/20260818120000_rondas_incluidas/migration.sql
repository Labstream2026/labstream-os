-- Rondas de cambios pactadas con el cliente. Null = sin tope acordado: se cuenta la ronda
-- igual, pero no hay techo ni aviso de exceso. El conteo no se guarda en ninguna columna: se
-- deriva de DeliverableDecision (stage=CLIENTE, result=CAMBIOS), que ya lo registra todo.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "roundsIncluded" INTEGER;
