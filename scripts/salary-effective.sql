-- Salary effective dating: revision history, arrears, arrears on payroll. Idempotent.
ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "arrears" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "SalaryRevisionLog" (
  "id"             TEXT PRIMARY KEY,
  "employeeId"     TEXT NOT NULL,
  "effectiveYear"  INTEGER NOT NULL,
  "effectiveMonth" INTEGER NOT NULL,
  "action"         TEXT NOT NULL,
  "source"         TEXT NOT NULL,
  "before"         JSONB,
  "after"          JSONB NOT NULL,
  "changedBy"      TEXT,
  "changedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SalaryRevisionLog_employeeId_changedAt_idx" ON "SalaryRevisionLog"("employeeId", "changedAt");

CREATE TABLE IF NOT EXISTS "SalaryArrear" (
  "id"         TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "forMonth"   INTEGER NOT NULL,
  "forYear"    INTEGER NOT NULL,
  "status"     TEXT NOT NULL DEFAULT 'PENDING',
  "oldGross"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "newGross"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "oldNet"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "newNet"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "grossDiff"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "pfDiff"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "esicDiff"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ptDiff"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "netDiff"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "amount"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "detail"     JSONB,
  "note"       TEXT,
  "createdBy"  TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "paidMonth"  INTEGER,
  "paidYear"   INTEGER,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SalaryArrear_employeeId_idx" ON "SalaryArrear"("employeeId");
CREATE INDEX IF NOT EXISTS "SalaryArrear_status_idx" ON "SalaryArrear"("status");
CREATE INDEX IF NOT EXISTS "SalaryArrear_forYear_forMonth_idx" ON "SalaryArrear"("forYear", "forMonth");
