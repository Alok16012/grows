import prisma from "@/lib/prisma"

// The payroll models (Payroll / PayrollRun) were added to schema.prisma after
// prod was provisioned and never got a migration — `grep PayrollRun
// prisma/migrations` returns nothing. Vercel can't run `migrate deploy` on this
// project either (DIRECT_URL isn't configured), so the generated client happily
// SELECTs tables and columns that don't exist and every payroll read 500s
// ("Failed to load payroll runs" on /payroll).
//
// Same treatment as lib/hr-doc-schema.ts and lib/payroll-rules-server.ts:
// create everything idempotently, cached per warm instance. Awaiting this
// before a payroll query is a no-op after the first call.
let ensured = false
let inFlight: Promise<void> | null = null

export async function ensurePayrollSchema(): Promise<void> {
    if (ensured) return
    if (inFlight) return inFlight
    inFlight = run().finally(() => { inFlight = null })
    return inFlight
}

const exec = (sql: string) => (prisma as any).$executeRawUnsafe(sql)

async function run(): Promise<void> {
    try {
        // CREATE TYPE has no IF NOT EXISTS — swallow the duplicate.
        await exec(`
            DO $$ BEGIN
                CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PROCESSED', 'PAID');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        `)

        await exec(`
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
            )
        `)
        // Table may predate the LWF/TDS/lock columns.
        await exec(`
            ALTER TABLE "PayrollRun"
                ADD COLUMN IF NOT EXISTS "lockedAt"         TIMESTAMP(3),
                ADD COLUMN IF NOT EXISTS "totalLwf"         DOUBLE PRECISION NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS "totalTds"         DOUBLE PRECISION NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS "totalPfEmployer"  DOUBLE PRECISION NOT NULL DEFAULT 0,
                ADD COLUMN IF NOT EXISTS "totalEsiEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0
        `)
        await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_month_year_key" ON "PayrollRun"("month", "year")`)
        await exec(`CREATE INDEX IF NOT EXISTS "PayrollRun_status_idx" ON "PayrollRun"("status")`)

        // Payroll is joined by the runs list (`_count: { payrolls: true }`), so a
        // missing Payroll table breaks the runs query too.
        await exec(`
            CREATE TABLE IF NOT EXISTS "Payroll" (
                "id"                  TEXT NOT NULL,
                "employeeId"          TEXT NOT NULL,
                "payrollRunId"        TEXT,
                "month"               INTEGER NOT NULL,
                "year"                INTEGER NOT NULL,
                "basicFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
                "daFull"              DOUBLE PRECISION NOT NULL DEFAULT 0,
                "hraFull"             DOUBLE PRECISION NOT NULL DEFAULT 0,
                "washingFull"         DOUBLE PRECISION NOT NULL DEFAULT 0,
                "conveyanceFull"      DOUBLE PRECISION NOT NULL DEFAULT 0,
                "lwwFull"             DOUBLE PRECISION NOT NULL DEFAULT 0,
                "bonusFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
                "otherFull"           DOUBLE PRECISION NOT NULL DEFAULT 0,
                "grossFullMonth"      DOUBLE PRECISION NOT NULL DEFAULT 0,
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
                "netSalary"           DOUBLE PRECISION NOT NULL DEFAULT 0,
                "ctc"                 DOUBLE PRECISION NOT NULL DEFAULT 0,
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
            )
        `)
        // Columns added to Payroll after prod was provisioned: the full-month
        // earnings block, the earned split and the statutory extras.
        await exec(`
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
                ADD COLUMN IF NOT EXISTS "remarks"             TEXT
        `)
        await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "Payroll_employeeId_month_year_key" ON "Payroll"("employeeId", "month", "year")`)
        await exec(`CREATE INDEX IF NOT EXISTS "Payroll_month_year_idx"    ON "Payroll"("month", "year")`)
        await exec(`CREATE INDEX IF NOT EXISTS "Payroll_status_idx"        ON "Payroll"("status")`)
        await exec(`CREATE INDEX IF NOT EXISTS "Payroll_employeeId_idx"    ON "Payroll"("employeeId")`)
        await exec(`CREATE INDEX IF NOT EXISTS "Payroll_payrollRunId_idx"  ON "Payroll"("payrollRunId")`)

        // Constraints have no IF NOT EXISTS — swallow the duplicate on re-run.
        for (const fk of [
            `ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_employeeId_fkey"
                 FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
            `ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_payrollRunId_fkey"
                 FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        ]) {
            try { await exec(fk) } catch { /* already present */ }
        }

        ensured = true
    } catch (e) {
        // Best effort — retried on the next call rather than cached as done.
        console.error("[PAYROLL_SCHEMA_ENSURE]", e)
    }
}
