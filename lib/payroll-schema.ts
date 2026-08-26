import prisma from "@/lib/prisma"

// The payroll models (Payroll / PayrollRun) were added to schema.prisma after
// prod was provisioned and never got a migration — `grep PayrollRun
// prisma/migrations` returns nothing. Vercel can't run `migrate deploy` on this
// project either (DIRECT_URL isn't configured), so the generated client happily
// SELECTs tables and columns that don't exist and every payroll read 500s
// ("Failed to load payroll runs" on /payroll).
//
// Prod turned out to have BOTH tables already, built from an older revision of
// the schema and short several columns (PayrollRun.processedBy was the first to
// surface). So the column lists below are exhaustive on purpose: guessing which
// columns are "the new ones" is what let processedBy slip through. Every column
// Prisma models is listed, every one carries a default so it can be added to a
// table that already has rows, and ADD COLUMN IF NOT EXISTS makes the ones that
// are already there free.
//
// Same shape as lib/hr-doc-schema.ts and lib/payroll-rules-server.ts: create
// everything idempotently, cached per warm instance. Awaiting this before a
// payroll query is a no-op after the first call.
let ensured = false
let inFlight: Promise<void> | null = null

export async function ensurePayrollSchema(): Promise<void> {
    if (ensured) return
    if (inFlight) return inFlight
    inFlight = run().finally(() => { inFlight = null })
    return inFlight
}

const exec = (sql: string) => (prisma as any).$executeRawUnsafe(sql)

// `id` is deliberately absent from both lists — a table missing its primary key
// is beyond repairing column-by-column, and CREATE TABLE covers the fresh case.
const PAYROLL_RUN_COLUMNS = [
    // month/year are NOT NULL with no default in the model. They can't
    // realistically be missing, but if they were, a 0 default is the only way to
    // add them to a table with rows — and it beats leaving the module dead.
    `"month"            INTEGER NOT NULL DEFAULT 0`,
    `"year"             INTEGER NOT NULL DEFAULT 0`,
    `"status"           "PayrollStatus" NOT NULL DEFAULT 'DRAFT'`,
    `"lockedAt"         TIMESTAMP(3)`,
    `"processedBy"      TEXT NOT NULL DEFAULT ''`,
    `"totalGross"       DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"totalNet"         DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"totalPfEmployer"  DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"totalEsiEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"totalLwf"         DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"totalTds"         DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `"updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
]

const PAYROLL_COLUMNS = [
    `"employeeId"          TEXT NOT NULL DEFAULT ''`,
    `"payrollRunId"        TEXT`,
    `"month"               INTEGER NOT NULL DEFAULT 0`,
    `"year"                INTEGER NOT NULL DEFAULT 0`,
    // full-month earnings
    `"basicFull"           DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"daFull"              DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"hraFull"             DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"washingFull"         DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"conveyanceFull"      DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"lwwFull"             DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"bonusFull"           DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"otherFull"           DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"grossFullMonth"      DOUBLE PRECISION NOT NULL DEFAULT 0`,
    // earned / prorated earnings
    `"basicSalary"         DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"da"                  DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"hra"                 DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"washing"             DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"conveyance"          DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"lwwEarned"           DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"bonus"               DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"allowances"          DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"otDays"              DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"overtimePay"         DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"productionIncentive" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"grossSalary"         DOUBLE PRECISION NOT NULL DEFAULT 0`,
    // deductions
    `"pfEmployee"          DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"pfEmployer"          DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"esiEmployee"         DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"esiEmployer"         DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"pt"                  DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"lwf"                 DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"tds"                 DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"canteenDays"         INTEGER NOT NULL DEFAULT 0`,
    `"canteen"             DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"penalty"             DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"advance"             DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"otherDeductions"     DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"totalDeductions"     DOUBLE PRECISION NOT NULL DEFAULT 0`,
    // net & CTC
    `"netSalary"           DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"ctc"                 DOUBLE PRECISION NOT NULL DEFAULT 0`,
    // attendance
    `"workingDays"         INTEGER NOT NULL DEFAULT 26`,
    `"presentDays"         INTEGER NOT NULL DEFAULT 26`,
    `"leaveDays"           DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"lwpDays"             DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"overtimeHrs"         DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"overtimeRate"        DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `"siteId"              TEXT`,
    `"status"              "PayrollStatus" NOT NULL DEFAULT 'DRAFT'`,
    `"processedAt"         TIMESTAMP(3)`,
    `"processedBy"         TEXT`,
    `"paidAt"              TIMESTAMP(3)`,
    `"paidBy"              TEXT`,
    `"remarks"             TEXT`,
    `"createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
    `"updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
]

// One ALTER for all the columns, because that's a single round trip. Postgres
// aborts the whole statement if any one clause errors, though, so fall back to
// adding them individually — a column we can't add must not stop the rest.
async function addColumns(table: string, columns: string[]): Promise<void> {
    try {
        await exec(`ALTER TABLE "${table}" ${columns.map(c => `ADD COLUMN IF NOT EXISTS ${c}`).join(", ")}`)
    } catch {
        for (const column of columns) {
            try { await exec(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS ${column}`) }
            catch (e) { console.error(`[PAYROLL_SCHEMA_ENSURE] ${table}.${column.trim().split(" ")[0]}`, e) }
        }
    }
}

async function run(): Promise<void> {
    try {
        // CREATE TYPE has no IF NOT EXISTS — swallow the duplicate.
        await exec(`
            DO $$ BEGIN
                CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'PROCESSED', 'PAID');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$
        `)

        // ── PayrollRun ──────────────────────────────────────────────────────
        await exec(`
            CREATE TABLE IF NOT EXISTS "PayrollRun" (
                "id" TEXT NOT NULL,
                CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
            )
        `)
        // Everything except the PK is added here, so a fresh table and a stale
        // one built from an older schema take the exact same path.
        await addColumns("PayrollRun", PAYROLL_RUN_COLUMNS)
        await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_month_year_key" ON "PayrollRun"("month", "year")`)
        await exec(`CREATE INDEX IF NOT EXISTS "PayrollRun_status_idx" ON "PayrollRun"("status")`)

        // ── Payroll ─────────────────────────────────────────────────────────
        // The runs list joins this table (`_count: { payrolls: true }`), so a
        // Payroll that's missing columns breaks the runs query too.
        await exec(`
            CREATE TABLE IF NOT EXISTS "Payroll" (
                "id" TEXT NOT NULL,
                CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
            )
        `)
        await addColumns("Payroll", PAYROLL_COLUMNS)
        await exec(`CREATE UNIQUE INDEX IF NOT EXISTS "Payroll_employeeId_month_year_key" ON "Payroll"("employeeId", "month", "year")`)
        await exec(`CREATE INDEX IF NOT EXISTS "Payroll_month_year_idx"   ON "Payroll"("month", "year")`)
        await exec(`CREATE INDEX IF NOT EXISTS "Payroll_status_idx"       ON "Payroll"("status")`)
        await exec(`CREATE INDEX IF NOT EXISTS "Payroll_employeeId_idx"   ON "Payroll"("employeeId")`)
        await exec(`CREATE INDEX IF NOT EXISTS "Payroll_payrollRunId_idx" ON "Payroll"("payrollRunId")`)

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
