-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_shootDate_idx" ON "Task"("shootDate");

-- CreateIndex
CREATE INDEX "Deliverable_status_idx" ON "Deliverable"("status");
