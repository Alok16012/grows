-- Link Expense to Project for project/client tracking
ALTER TABLE "Expense"
    ADD COLUMN IF NOT EXISTS "projectId" TEXT;

ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "Expense_projectId_idx" ON "Expense"("projectId");
