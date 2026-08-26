-- ============================================================================
-- Payroll schema repair — fixes "Failed to load payroll runs" on /payroll
-- ============================================================================
--
-- WHY: the Payroll / PayrollRun models were added to schema.prisma but never
-- got a migration (`grep PayrollRun prisma/migrations` returns nothing), and
-- prod migrations are applied by hand here because DIRECT_URL isn't configured
-- on Vercel. So the generated Prisma client SELECTs tables and columns that
-- don't exist in prod and every payroll read 500s.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run once.
-- Safe to re-run — every statement is idempotent, and the constraint blocks
-- swallow their own "already exists" errors so the surrounding transaction is
-- never aborted. Existing rows are not touched or deleted.
--
-- This mirrors lib/payroll-schema.ts exactly. The app self-heals on its own the
-- first time /api/payroll/runs is hit; this file is the manual equivalent for
-- when you'd rather fix the DB up front.
-- ============================================================================


-- ── 1. PayrollStatus enum ───────────────────────────────────────────────────
-- CREATE TYPE has no IF NOT EXISTS, hence the DO block.
DO $$ BEGIN
    CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PROCESSED', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 2. PayrollRun ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PayrollRun" (
    "id"               TEXT NOT NULL,
    "month"            INTEGER NOT NULL,
    "year"             INTEGER NOT NULL,
    "status"           "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt"         TIMESTAMP(3),
    "processedBy"      TEXT NOT NULL DEFAULT '',
    "totalGross"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalNet"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPfEmployer"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEsiEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLwf"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTds"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- The table may predate the LWF / TDS / lock columns.
ALTER TABLE "PayrollRun"
    ADD COLUMN IF NOT EXISTS "lockedAt"         TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "totalLwf"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalTds"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalPfEmployer"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalEsiEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_month_year_key" ON "PayrollRun"("month", "year");
CREATE INDEX        IF NOT EXISTS "PayrollRun_status_idx"     ON "PayrollRun"("status");


-- ── 3. Payroll ──────────────────────────────────────────────────────────────
-- The runs list joins this table (`_count: { payrolls: true }`), so a missing
-- Payroll table breaks the runs query too — not just the payroll list.
CREATE TABLE IF NOT EXISTS "Payroll" (
    "id"                  TEXT NOT NULL,
    "employeeId"          TEXT NOT NULL,
    "payrollRunId"        TEXT,
    "month"               INTEGER NOT NULL,
    "year"                INTEGER NOT NULL,
    -- full-month earnings
    "basicFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "daFull"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hraFull"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "washingFull"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conveyanceFull"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lwwFull"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonusFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossFullMonth"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- earned / prorated earnings
    "basicSalary"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "da"                  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hra"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    "washing"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "conveyance"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lwwEarned"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonus"               DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allowances"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otDays"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimePay"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "productionIncentive" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossSalary"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- deductions
    "pfEmployee"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pfEmployer"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esiEmployee"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "esiEmployer"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pt"                  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lwf"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tds"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    "canteenDays"         INTEGER NOT NULL DEFAULT 0,
    "canteen"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penalty"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advance"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherDeductions"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- net & CTC
    "netSalary"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctc"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- attendance
    "workingDays"         INTEGER NOT NULL DEFAULT 26,
    "presentDays"         INTEGER NOT NULL DEFAULT 26,
    "leaveDays"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lwpDays"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHrs"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeRate"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "siteId"              TEXT,
    "status"              "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "processedAt"         TIMESTAMP(3),
    "processedBy"         TEXT,
    "paidAt"              TIMESTAMP(3),
    "paidBy"              TEXT,
    "remarks"             TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- Columns added to Payroll after prod was provisioned: the full-month earnings
-- block, the earned split and the statutory extras.
ALTER TABLE "Payroll"
    ADD COLUMN IF NOT EXISTS "payrollRunId"        TEXT,
    ADD COLUMN IF NOT EXISTS "basicFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "daFull"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "hraFull"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "washingFull"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "conveyanceFull"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lwwFull"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "bonusFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "otherFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "grossFullMonth"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "washing"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "conveyance"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lwwEarned"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "otDays"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "productionIncentive" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lwf"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "tds"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "canteenDays"         INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "canteen"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "penalty"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "ctc"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "siteId"              TEXT,
    ADD COLUMN IF NOT EXISTS "remarks"             TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Payroll_employeeId_month_year_key" ON "Payroll"("employeeId", "month", "year");
CREATE INDEX        IF NOT EXISTS "Payroll_month_year_idx"            ON "Payroll"("month", "year");
CREATE INDEX        IF NOT EXISTS "Payroll_status_idx"                ON "Payroll"("status");
CREATE INDEX        IF NOT EXISTS "Payroll_employeeId_idx"            ON "Payroll"("employeeId");
CREATE INDEX        IF NOT EXISTS "Payroll_payrollRunId_idx"          ON "Payroll"("payrollRunId");


-- ── 4. Foreign keys ─────────────────────────────────────────────────────────
-- ADD CONSTRAINT has no IF NOT EXISTS. Each gets its own DO block so a
-- duplicate can't abort the transaction the SQL editor wraps this file in.
DO $$ BEGIN
    ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_payrollRunId_fkey"
        FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── 5. Verify ───────────────────────────────────────────────────────────────
-- Expect: PayrollRun = 14 columns, Payroll = 56 columns, 2 foreign keys.
SELECT table_name, count(*) AS columns
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('Payroll', 'PayrollRun')
GROUP BY table_name
ORDER BY table_name;

SELECT conname AS foreign_key
FROM pg_constraint
WHERE conrelid = '"Payroll"'::regclass AND contype = 'f'
ORDER BY conname;
