-- CL1 · Fecha viva de entrega: la anterior + cuándo cambió (aviso en el portal del cliente).
ALTER TABLE "Project" ADD COLUMN "prevDueDate" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "dueDateChangedAt" TIMESTAMP(3);
