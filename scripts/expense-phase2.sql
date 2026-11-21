-- Expenses Phases 2-4: two-level approval, payroll settlement, advances.
-- Additive and safe to re-run.
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "approvalStage" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "approvalTrail" JSONB;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "settledVia" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "payrollMonth" INTEGER;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "payrollYear" INTEGER;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "advanceId" TEXT;
CREATE INDEX IF NOT EXISTS "Expense_payroll_idx" ON "Expense" ("payrollYear", "payrollMonth");
CREATE INDEX IF NOT EXISTS "Expense_advanceId_idx" ON "Expense" ("advanceId");

ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "reimbursement" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ExpenseAdvance" (
  "id"            TEXT PRIMARY KEY,
  "advanceNo"     TEXT NOT NULL UNIQUE,
  "requestedBy"   TEXT NOT NULL,
  "purpose"       TEXT NOT NULL,
  "amount"        DOUBLE PRECISION NOT NULL,
  "neededBy"      TIMESTAMP(3),
  "siteId"        TEXT,
  "siteName"      TEXT,
  "status"        TEXT NOT NULL DEFAULT 'REQUESTED',
  "approvalTrail" JSONB,
  "approvedBy"    TEXT,
  "approvedAt"    TIMESTAMP(3),
  "rejectionReason" TEXT,
  "paidAt"        TIMESTAMP(3),
  "paymentMode"   TEXT,
  "transactionId" TEXT,
  "settledAt"     TIMESTAMP(3),
  "settledBy"     TEXT,
  "claimedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "balanceAction" TEXT,
  "balanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recoverMonth"  INTEGER,
  "recoverYear"   INTEGER,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ExpenseAdvance_requestedBy_idx" ON "ExpenseAdvance" ("requestedBy");
CREATE INDEX IF NOT EXISTS "ExpenseAdvance_status_idx" ON "ExpenseAdvance" ("status");
