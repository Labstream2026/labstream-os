-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "stages" TEXT[] DEFAULT ARRAY['Preproducción', 'Producción', 'Postproducción', 'Revisión cliente', 'Entregado']::TEXT[];

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "shootDate" TIMESTAMP(3),
ADD COLUMN     "stage" TEXT;
