-- Extras de tarea (aditivo, no toca datos existentes): etiquetas, enlaces/adjuntos y seguidores.

-- CreateTable
CREATE TABLE "TaskTag" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLink" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskWatcher" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskWatcher_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "TaskTag_taskId_idx" ON "TaskTag"("taskId");

-- CreateIndex
CREATE INDEX "TaskLink_taskId_idx" ON "TaskLink"("taskId");

-- CreateIndex
CREATE INDEX "TaskWatcher_userId_idx" ON "TaskWatcher"("userId");

-- AddForeignKey
ALTER TABLE "TaskTag" ADD CONSTRAINT "TaskTag_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLink" ADD CONSTRAINT "TaskLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskWatcher" ADD CONSTRAINT "TaskWatcher_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskWatcher" ADD CONSTRAINT "TaskWatcher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
