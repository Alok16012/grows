-- Payroll change control: dated PF / pension / ESIC switches. Idempotent.
CREATE TABLE IF NOT EXISTS "EmployeeStatutoryChange" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "fromYear" INTEGER NOT NULL,
  "fromMonth" INTEGER NOT NULL,
  "pfApplicable" BOOLEAN NOT NULL,
  "pensionApplicable" BOOLEAN NOT NULL,
  "esicApplicable" BOOLEAN NOT NULL,
  "changedBy" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeStatutoryChange_employeeId_fromYear_fromMonth_key" ON "EmployeeStatutoryChange"("employeeId", "fromYear", "fromMonth");
CREATE INDEX IF NOT EXISTS "EmployeeStatutoryChange_employeeId_idx" ON "EmployeeStatutoryChange"("employeeId")
