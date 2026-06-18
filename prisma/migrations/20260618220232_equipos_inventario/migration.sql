-- CreateTable
CREATE TABLE "EquipmentKit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentKitItem" (
    "id" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "EquipmentKitItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT,
    "shootDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planeando',
    "assigneeId" TEXT,
    "taskId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentReservation" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "packed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentKit_name_key" ON "EquipmentKit"("name");

-- CreateIndex
CREATE INDEX "EquipmentKitItem_rowId_idx" ON "EquipmentKitItem"("rowId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentKitItem_kitId_rowId_key" ON "EquipmentKitItem"("kitId", "rowId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentPlan_taskId_key" ON "EquipmentPlan"("taskId");

-- CreateIndex
CREATE INDEX "EquipmentPlan_projectId_idx" ON "EquipmentPlan"("projectId");

-- CreateIndex
CREATE INDEX "EquipmentPlan_shootDate_idx" ON "EquipmentPlan"("shootDate");

-- CreateIndex
CREATE INDEX "EquipmentPlan_assigneeId_idx" ON "EquipmentPlan"("assigneeId");

-- CreateIndex
CREATE INDEX "EquipmentReservation_rowId_idx" ON "EquipmentReservation"("rowId");

-- CreateIndex
CREATE INDEX "EquipmentReservation_planId_idx" ON "EquipmentReservation"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentReservation_planId_rowId_key" ON "EquipmentReservation"("planId", "rowId");

-- AddForeignKey
ALTER TABLE "EquipmentKit" ADD CONSTRAINT "EquipmentKit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentKitItem" ADD CONSTRAINT "EquipmentKitItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "EquipmentKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentKitItem" ADD CONSTRAINT "EquipmentKitItem_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "DataRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPlan" ADD CONSTRAINT "EquipmentPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPlan" ADD CONSTRAINT "EquipmentPlan_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPlan" ADD CONSTRAINT "EquipmentPlan_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPlan" ADD CONSTRAINT "EquipmentPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentReservation" ADD CONSTRAINT "EquipmentReservation_planId_fkey" FOREIGN KEY ("planId") REFERENCES "EquipmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentReservation" ADD CONSTRAINT "EquipmentReservation_rowId_fkey" FOREIGN KEY ("rowId") REFERENCES "DataRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
