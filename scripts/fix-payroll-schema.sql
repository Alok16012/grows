-- ============================================================================
-- Payroll schema repair — fixes "Failed to load payroll runs" on /payroll
-- ============================================================================
--
-- WHY: the Payroll / PayrollRun models were added to schema.prisma but never
-- got a migration (`grep PayrollRun prisma/migrations` returns nothing), and
-- prod migrations are applied by hand here because DIRECT_URL isn't configured
-- on Vercel. Prod ended up with both tables built from an older revision of the
-- schema and short several columns, and with at least one column hand-patched
-- in via unquoted DDL so Postgres folded it to lower case (`processedby`) where
-- Prisma can't see it. Reads 500 on the missing columns; writes 500 on the
-- lower-cased one. Section 2 handles the case folding, sections 3-4 the rest.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run once.
-- Safe to re-run — every statement is idempotent, and the constraint blocks
-- swallow their own "already exists" errors so the surrounding transaction is
-- never aborted. Existing rows are never touched or deleted: new columns land
-- on them with their defaults.
--
-- The column lists are exhaustive on purpose. Guessing which columns are "the
-- new ones" is exactly what let processedBy slip through, so every column
-- Prisma models is listed here and ADD COLUMN IF NOT EXISTS makes the ones that
-- already exist free.
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


-- ── 2. Reconcile case-folded legacy columns ─────────────────────────────────
-- Parts of prod were hand-patched with UNQUOTED DDL — `ALTER TABLE "PayrollRun"
-- ADD COLUMN processedBy TEXT NOT NULL` — and Postgres folds unquoted
-- identifiers to lower case, so the column landed as `processedby`. Prisma only
-- ever touches the quoted `"processedBy"`, so the two never met: section 3 adds
-- its own `"processedBy"` and every INSERT then dies on the legacy `processedby`
-- (NOT NULL, no default, invisible to Prisma) with
--   Null constraint violation on the fields: (`processedby`)
--
-- Per column:
--   • legacy only  -> RENAME to the camelCase name, data and all. The good
--     outcome, and why this must run BEFORE section 3 adds anything.
--   • both present -> the legacy one is dead weight Prisma will never fill, so
--     DROP NOT NULL to unblock writes.
-- Nothing is ever dropped or overwritten; whatever the legacy column holds
-- stays put. Tables that don't exist yet are skipped.
DO $$
DECLARE
    spec   RECORD;
    col    TEXT;
    legacy TEXT;
BEGIN
    FOR spec IN
        SELECT * FROM (VALUES
            ('PayrollRun', ARRAY[
                'lockedAt','processedBy','totalGross','totalNet','totalPfEmployer',
                'totalEsiEmployer','totalLwf','totalTds','createdAt','updatedAt'
            ]),
            ('Payroll', ARRAY[
                'employeeId','payrollRunId','basicFull','daFull','hraFull','washingFull',
                'conveyanceFull','lwwFull','bonusFull','otherFull','grossFullMonth',
                'basicSalary','lwwEarned','otDays','overtimePay','productionIncentive',
                'grossSalary','pfEmployee','pfEmployer','esiEmployee','esiEmployer',
                'canteenDays','otherDeductions','totalDeductions','netSalary','workingDays',
                'presentDays','leaveDays','lwpDays','overtimeHrs','overtimeRate','siteId',
                'processedAt','processedBy','paidAt','paidBy','createdAt','updatedAt'
            ])
        ) AS t(tbl, cols)
    LOOP
        CONTINUE WHEN NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = spec.tbl
        );
        FOREACH col IN ARRAY spec.cols LOOP
            legacy := lower(col);
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = legacy
            ) THEN
                IF EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = spec.tbl AND column_name = col
                ) THEN
                    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', spec.tbl, legacy);
                ELSE
                    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', spec.tbl, legacy, col);
                END IF;
            END IF;
        END LOOP;
    END LOOP;
END $$;


-- ── 3. PayrollRun ───────────────────────────────────────────────────────────
-- Only the primary key is created here; every other column is added below, so a
-- brand new table and a stale one take the exact same path.
CREATE TABLE IF NOT EXISTS "PayrollRun" (
    "id" TEXT NOT NULL,
    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- month/year are NOT NULL with no default in the model. They can't realistically
-- be missing, but if they were, a 0 default is the only way to add them to a
-- table that already has rows.
ALTER TABLE "PayrollRun"
    ADD COLUMN IF NOT EXISTS "month"            INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "year"             INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "status"           "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN IF NOT EXISTS "lockedAt"         TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "processedBy"      TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "totalGross"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalNet"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalPfEmployer"  DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalEsiEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalLwf"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalTds"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_month_year_key" ON "PayrollRun"("month", "year");
CREATE INDEX        IF NOT EXISTS "PayrollRun_status_idx"     ON "PayrollRun"("status");


-- ── 4. Payroll ──────────────────────────────────────────────────────────────
-- The runs list joins this table (`_count: { payrolls: true }`), so a Payroll
-- that's missing columns breaks the runs query too — not just the payroll list.
CREATE TABLE IF NOT EXISTS "Payroll" (
    "id" TEXT NOT NULL,
    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payroll"
    ADD COLUMN IF NOT EXISTS "employeeId"          TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "payrollRunId"        TEXT,
    ADD COLUMN IF NOT EXISTS "month"               INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "year"                INTEGER NOT NULL DEFAULT 0,
    -- full-month earnings
    ADD COLUMN IF NOT EXISTS "basicFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "daFull"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "hraFull"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "washingFull"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "conveyanceFull"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lwwFull"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "bonusFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "otherFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "grossFullMonth"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- earned / prorated earnings
    ADD COLUMN IF NOT EXISTS "basicSalary"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "da"                  DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "hra"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "washing"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "conveyance"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lwwEarned"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "bonus"               DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "allowances"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "otDays"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "overtimePay"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "productionIncentive" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "grossSalary"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- deductions
    ADD COLUMN IF NOT EXISTS "pfEmployee"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "pfEmployer"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "esiEmployee"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "esiEmployer"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "pt"                  DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lwf"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "tds"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "canteenDays"         INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "canteen"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "penalty"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "advance"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "otherDeductions"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalDeductions"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- net & CTC
    ADD COLUMN IF NOT EXISTS "netSalary"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "ctc"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- attendance
    ADD COLUMN IF NOT EXISTS "workingDays"         INTEGER NOT NULL DEFAULT 26,
    ADD COLUMN IF NOT EXISTS "presentDays"         INTEGER NOT NULL DEFAULT 26,
    ADD COLUMN IF NOT EXISTS "leaveDays"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "lwpDays"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "overtimeHrs"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "overtimeRate"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "siteId"              TEXT,
    ADD COLUMN IF NOT EXISTS "status"              "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN IF NOT EXISTS "processedAt"         TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "processedBy"         TEXT,
    ADD COLUMN IF NOT EXISTS "paidAt"              TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "paidBy"              TEXT,
    ADD COLUMN IF NOT EXISTS "remarks"             TEXT,
    ADD COLUMN IF NOT EXISTS "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "Payroll_employeeId_month_year_key" ON "Payroll"("employeeId", "month", "year");
CREATE INDEX        IF NOT EXISTS "Payroll_month_year_idx"            ON "Payroll"("month", "year");
CREATE INDEX        IF NOT EXISTS "Payroll_status_idx"                ON "Payroll"("status");
CREATE INDEX        IF NOT EXISTS "Payroll_employeeId_idx"            ON "Payroll"("employeeId");
CREATE INDEX        IF NOT EXISTS "Payroll_payrollRunId_idx"          ON "Payroll"("payrollRunId");


-- ── 5. Foreign keys ─────────────────────────────────────────────────────────
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


-- ── 6. Verify ───────────────────────────────────────────────────────────────
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
