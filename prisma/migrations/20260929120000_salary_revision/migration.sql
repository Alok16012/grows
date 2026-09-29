-- Effective-dated salary structures.
--
-- EmployeeSalary carries one row per employee and no history, so a bulk
-- increment uploaded today changed what a re-run of an ALREADY PROCESSED month
-- would pay. SalaryRevision records a structure against the month it takes
-- effect from, and the wage run reads the newest revision effective on or
-- before the month it is processing.
--
-- Nothing is backfilled: an employee with no revision falls back to
-- EmployeeSalary, which is exactly today's behaviour. So this table is inert
-- until the first dated upload.
--
-- Production migrations are applied by hand (DIRECT_URL is unset on Vercel), so
-- every statement is idempotent and the file is safe to paste into the Supabase
-- SQL editor and re-run.

CREATE TABLE IF NOT EXISTS "SalaryRevision" (
    "id"                TEXT NOT NULL,
    "employeeId"        TEXT NOT NULL,
    "effectiveMonth"    INTEGER NOT NULL,
    "effectiveYear"     INTEGER NOT NULL,
    "basic"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "da"                DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hra"               DOUBLE PRECISION NOT NULL DEFAULT 0,
    "washing"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conveyance"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leaveWithWages"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAllowance"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonus"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otRatePerHour"     DOUBLE PRECISION NOT NULL DEFAULT 170,
    "canteenRatePerDay" DOUBLE PRECISION NOT NULL DEFAULT 55,
    "complianceType"    TEXT NOT NULL DEFAULT 'OR',
    "ctcMonthly"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctcAnnual"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note"              TEXT,
    "createdBy"         TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalaryRevision_pkey" PRIMARY KEY ("id")
);

-- One structure per employee per month, so re-uploading a month corrects it
-- instead of stacking a duplicate the lookup would have to break ties on.
CREATE UNIQUE INDEX IF NOT EXISTS "SalaryRevision_employeeId_effectiveYear_effectiveMonth_key"
    ON "SalaryRevision"("employeeId", "effectiveYear", "effectiveMonth");
CREATE INDEX IF NOT EXISTS "SalaryRevision_employeeId_idx"
    ON "SalaryRevision"("employeeId");
CREATE INDEX IF NOT EXISTS "SalaryRevision_effectiveYear_effectiveMonth_idx"
    ON "SalaryRevision"("effectiveYear", "effectiveMonth");

DO $$ BEGIN
    ALTER TABLE "SalaryRevision" ADD CONSTRAINT "SalaryRevision_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
