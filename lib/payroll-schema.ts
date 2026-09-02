import prisma from "@/lib/prisma"
import { schemaSelfHealEnabled } from "@/lib/schema-selfheal"

// The payroll models (Payroll / PayrollRun) were added to schema.prisma but
// never got a migration — `grep PayrollRun prisma/migrations` returns nothing —
// and Vercel can't run `migrate deploy` here because DIRECT_URL isn't
// configured. Prod's copies were built by hand from an older revision of the
// schema, so the generated client keeps hitting things that don't match. Three
// distinct failure modes have surfaced so far, each as a different 500:
//
//   1. missing column   -> `The column PayrollRun.processedBy does not exist`
//   2. case-folded twin -> `Null constraint violation on the fields:
//                           (processedby)` — a column hand-patched in with
//                           unquoted DDL, which Postgres folds to lower case
//                           where Prisma can never see it
//   3. wrong type       -> `operator does not exist: text <> "PayrollStatus"`
//                          — status is TEXT in prod, an enum in the schema
//
// Fixing them one at a time is whack-a-mole, so this reconciles all three
// against one declared spec: SCHEMA below is the single source of truth and is
// meant to be diffable against schema.prisma by eye. Nothing here drops a
// column or deletes a row.
//
// Cached per warm instance, like lib/hr-doc-schema.ts. Awaiting it before a
// payroll query is a no-op after the first call.
let ensured = false
let inFlight: Promise<void> | null = null

export async function ensurePayrollSchema(): Promise<void> {
    // Off in production: ~20 DDL statements in front of every cold-start
    // request, and they only stop repeating once they succeed. See
    // lib/schema-selfheal.ts — prod schema comes from
    // scripts/fix-payroll-schema.sql instead.
    if (!schemaSelfHealEnabled()) return
    if (ensured) return
    if (inFlight) return inFlight
    inFlight = run().finally(() => { inFlight = null })
    return inFlight
}

const exec = (sql: string) => (prisma as any).$executeRawUnsafe(sql)

// ─── The spec ────────────────────────────────────────────────────────────────
type Col = {
    name: string
    /** SQL type as written in DDL, e.g. `DOUBLE PRECISION` or `"PayrollStatus"`. */
    type: string
    notNull?: boolean
    /** SQL default expression, e.g. `0` or `'DRAFT'`. */
    def?: string
}

const num  = (name: string): Col => ({ name, type: "DOUBLE PRECISION", notNull: true, def: "0" })
const int  = (name: string, def = "0"): Col => ({ name, type: "INTEGER", notNull: true, def })
const text = (name: string): Col => ({ name, type: "TEXT" })
const time = (name: string): Col => ({ name, type: "TIMESTAMP(3)" })
const stamp = (name: string): Col =>
    ({ name, type: "TIMESTAMP(3)", notNull: true, def: "CURRENT_TIMESTAMP" })
const status: Col = { name: "status", type: `"PayrollStatus"`, notNull: true, def: `'DRAFT'` }

const PAYROLL_STATUS_VALUES = ["DRAFT", "PROCESSED", "PAID"]

// `id` is deliberately absent from both specs — a table missing its primary key
// is beyond repairing column by column, and CREATE TABLE covers the fresh case.
//
// month/year are NOT NULL with no default in the model. They can't realistically
// be missing, but if they were, a 0 default is the only way to add them to a
// table that already has rows, and that beats leaving the module dead.
const PAYROLL_RUN: Col[] = [
    int("month"), int("year"), status, time("lockedAt"),
    { name: "processedBy", type: "TEXT", notNull: true, def: `''` },
    num("totalGross"), num("totalNet"), num("totalPfEmployer"),
    num("totalEsiEmployer"), num("totalLwf"), num("totalTds"),
    stamp("createdAt"), stamp("updatedAt"),
]

const PAYROLL: Col[] = [
    { name: "employeeId", type: "TEXT", notNull: true, def: `''` },
    text("payrollRunId"), int("month"), int("year"),
    // full-month earnings
    num("basicFull"), num("daFull"), num("hraFull"), num("washingFull"),
    num("conveyanceFull"), num("lwwFull"), num("bonusFull"), num("otherFull"),
    num("grossFullMonth"),
    // earned / prorated earnings
    num("basicSalary"), num("da"), num("hra"), num("washing"), num("conveyance"),
    num("lwwEarned"), num("bonus"), num("allowances"), num("otDays"),
    num("overtimePay"), num("productionIncentive"), num("grossSalary"),
    // deductions
    num("pfEmployee"), num("pfEmployer"), num("esiEmployee"), num("esiEmployer"),
    num("pt"), num("lwf"), num("tds"), int("canteenDays"), num("canteen"),
    // Nullable — NULL means "derive from days x rate", 0 means "no canteen".
    { name: "canteenAmount", type: "DOUBLE PRECISION" },
    num("penalty"), num("advance"), num("otherDeductions"), num("totalDeductions"),
    // net & CTC
    num("netSalary"), num("ctc"),
    // attendance
    int("workingDays", "26"), int("presentDays", "26"), num("leaveDays"),
    num("lwpDays"), num("overtimeHrs"), num("overtimeRate"),
    text("siteId"), status, time("processedAt"), text("processedBy"),
    time("paidAt"), text("paidBy"), text("remarks"),
    stamp("createdAt"), stamp("updatedAt"),
]

// ─── SQL helpers ─────────────────────────────────────────────────────────────
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`
const isEnum = (col: Col) => col.type.startsWith(`"`)

/** What information_schema.columns.udt_name reports for a given DDL type. */
function udtOf(type: string): string {
    if (type.startsWith(`"`)) return type.slice(1, -1)
    if (type === "INTEGER") return "int4"
    if (type === "DOUBLE PRECISION") return "float8"
    if (type === "TEXT") return "text"
    if (type.startsWith("TIMESTAMP")) return "timestamp"
    return type.toLowerCase()
}

/** Expression that converts whatever is in the column today to the wanted type. */
function usingOf(col: Col): string {
    const q = `"${col.name}"`
    if (isEnum(col)) return `${q}::text::${col.type}`
    if (col.type === "INTEGER") return `ROUND(NULLIF(${q}::text, '')::numeric)::integer`
    if (col.type === "DOUBLE PRECISION") return `NULLIF(${q}::text, '')::double precision`
    if (col.type === "TEXT") return `${q}::text`
    if (col.type.startsWith("TIMESTAMP")) return `NULLIF(${q}::text, '')::timestamp(3)`
    return q
}

const ddl = (col: Col) =>
    `"${col.name}" ${col.type}${col.notNull ? " NOT NULL" : ""}${col.def ? ` DEFAULT ${col.def}` : ""}`

// ─── 1. Case-folded twins ────────────────────────────────────────────────────
// `ALTER TABLE "PayrollRun" ADD COLUMN processedBy TEXT NOT NULL` folds to
// `processedby`, which Prisma never reads or writes. Reconcile before adding
// anything, so the rename branch can win:
//   • legacy only  -> RENAME to the camelCase name, data and all.
//   • both present -> the legacy one is dead weight Prisma will never fill, so
//     DROP NOT NULL to unblock writes. Its contents are left alone.
function legacyCaseStatement(table: string, cols: Col[]): string | null {
    const names = cols.map(c => c.name).filter(n => n !== n.toLowerCase())
    if (!names.length) return null
    return `
            DO $do$
            DECLARE
                expected TEXT[] := ARRAY[${names.map(lit).join(", ")}];
                col    TEXT;
                legacy TEXT;
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = ${lit(table)}
                ) THEN RETURN; END IF;
                FOREACH col IN ARRAY expected LOOP
                    -- Per-column handler: the Supabase editor runs this file as
                    -- ONE transaction, so an unhandled error on any single
                    -- column rolls back every other fix in the file. Skip the
                    -- column, keep the repair.
                    BEGIN
                        legacy := lower(col);
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'public' AND table_name = ${lit(table)} AND column_name = legacy
                        ) THEN
                            IF EXISTS (
                                SELECT 1 FROM information_schema.columns
                                WHERE table_schema = 'public' AND table_name = ${lit(table)} AND column_name = col
                            ) THEN
                                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', ${lit(table)}, legacy);
                            ELSE
                                EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', ${lit(table)}, legacy, col);
                            END IF;
                        END IF;
                    EXCEPTION WHEN OTHERS THEN
                        RAISE NOTICE 'skipped legacy-case fix on %.%: %', ${lit(table)}, col, SQLERRM;
                    END;
                END LOOP;
            END $do$`
}

async function reconcileLegacyCase(table: string, cols: Col[]): Promise<void> {
    const statement = legacyCaseStatement(table, cols)
    if (!statement) return
    try { await exec(statement) }
    catch (e) { console.error(`[PAYROLL_SCHEMA_ENSURE] case reconcile ${table}`, e) }
}

// ─── 2. Missing columns ──────────────────────────────────────────────────────
// One ALTER for all of them, because that's a single round trip. Postgres aborts
// the whole statement if any one clause errors, though, so fall back to adding
// them individually — a column we can't add must not stop the rest.
const addColumnsStatement = (table: string, cols: Col[]) =>
    `ALTER TABLE "${table}"\n    ${cols.map(c => `ADD COLUMN IF NOT EXISTS ${ddl(c)}`).join(",\n    ")}`

async function addColumns(table: string, cols: Col[]): Promise<void> {
    try {
        await exec(addColumnsStatement(table, cols))
    } catch {
        for (const col of cols) {
            try { await exec(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS ${ddl(col)}`) }
            catch (e) { console.error(`[PAYROLL_SCHEMA_ENSURE] ${table}.${col.name}`, e) }
        }
    }
}

// ─── 3. Wrong types ──────────────────────────────────────────────────────────
// ADD COLUMN IF NOT EXISTS silently no-ops on a column that already exists with
// the WRONG type, which is how prod kept a TEXT `status` while the client
// generated `status <> 'DRAFT'::"PayrollStatus"` and Postgres refused to compare
// them. Compare each column's real udt_name against the spec and convert the
// ones that differ, leaving matching columns untouched.
function typeReconcileStatement(table: string, cols: Col[]): string {
    const rows = cols.map(col => [
        lit(col.name),
        lit(udtOf(col.type)),
        lit(col.type),
        lit(usingOf(col)),
        col.notNull ? "true" : "false",
        lit(col.def ?? ""),
    ].join(", ")).map(r => `(${r})`).join(",\n                ")

    return `
            DO $do$
            DECLARE
                spec   RECORD;
                actual TEXT;
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = ${lit(table)}
                ) THEN RETURN; END IF;

                FOR spec IN SELECT * FROM (VALUES
                ${rows}
                ) AS t(col, want_udt, type_sql, using_sql, not_null, def_sql)
                LOOP
                    -- Per-column handler: the Supabase editor runs this file as
                    -- ONE transaction, so an unhandled error on any single
                    -- column rolls back every other fix in the file. A column
                    -- whose type can't be reconciled is skipped with a NOTICE
                    -- instead of taking the whole repair down. Written as an IF
                    -- rather than CONTINUE because a jump out of a block that
                    -- has an EXCEPTION clause is best avoided.
                    BEGIN
                        SELECT c.udt_name INTO actual
                        FROM information_schema.columns c
                        WHERE c.table_schema = 'public' AND c.table_name = ${lit(table)}
                          AND c.column_name = spec.col;

                        -- Absent (addColumns handles that) or already right: leave it.
                        IF actual IS NOT NULL AND actual <> spec.want_udt THEN
                            -- The old default is expressed in the old type, so it
                            -- has to go before the column can change type.
                            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', ${lit(table)}, spec.col);

                            -- A value outside the enum would abort the cast. Park
                            -- those on the default rather than failing the repair.
                            IF spec.want_udt = ${lit(udtOf(status.type))} THEN
                                EXECUTE format(
                                    'UPDATE %I SET %I = %L WHERE %I IS NULL OR %I::text <> ALL (%L::text[])',
                                    ${lit(table)}, spec.col, 'DRAFT', spec.col, spec.col,
                                    ${lit(`{${PAYROLL_STATUS_VALUES.join(",")}}`)});
                            END IF;

                            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE %s USING %s',
                                           ${lit(table)}, spec.col, spec.type_sql, spec.using_sql);

                            IF spec.def_sql <> '' THEN
                                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s',
                                               ${lit(table)}, spec.col, spec.def_sql);
                            END IF;

                            IF spec.not_null THEN
                                -- The cast can leave NULLs behind (empty strings
                                -- become NULL), so fill them before re-asserting.
                                IF spec.def_sql <> '' THEN
                                    EXECUTE format('UPDATE %I SET %I = %s WHERE %I IS NULL',
                                                   ${lit(table)}, spec.col, spec.def_sql, spec.col);
                                END IF;
                                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET NOT NULL', ${lit(table)}, spec.col);
                            END IF;
                        END IF;
                    EXCEPTION WHEN OTHERS THEN
                        RAISE NOTICE 'skipped type fix on %.%: %', ${lit(table)}, spec.col, SQLERRM;
                    END;
                END LOOP;
            END $do$`
}

async function reconcileTypes(table: string, cols: Col[]): Promise<void> {
    try { await exec(typeReconcileStatement(table, cols)) }
    catch (e) { console.error(`[PAYROLL_SCHEMA_ENSURE] type reconcile ${table}`, e) }
}

// ─── 4. Missing primary key ──────────────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS no-ops on an existing table, so its inline PRIMARY
// KEY never reaches a table that was created without one. Prod's PayrollRun had
// no key on "id" at all, which Prisma tolerates but a foreign key does not:
//   there is no unique constraint matching given keys for referenced table
//   "PayrollRun"
// Duplicate ids are left alone rather than deleted — losing a payroll row to
// tidy up a constraint is not a trade worth making. The FK is simply skipped in
// that case, which is how things already stand.
const primaryKeyStatement = (table: string) => `
            DO $do$
            DECLARE
                rel   REGCLASS := to_regclass(${lit(`public."${table}"`)});
                dupes BIGINT;
            BEGIN
                IF rel IS NULL THEN RETURN; END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = ${lit(table)} AND column_name = 'id'
                ) THEN RETURN; END IF;

                -- Already keyed (primary or unique) on exactly "id"?
                IF EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = rel AND contype IN ('p', 'u')
                      AND conkey = ARRAY[(
                          SELECT attnum FROM pg_attribute
                          WHERE attrelid = rel AND attname = 'id'
                            AND attnum > 0 AND NOT attisdropped
                      )]::smallint[]
                ) THEN RETURN; END IF;

                -- The constraint NAME is a relation name too, so a leftover
                -- index called "<table>_pkey" — one hand-created without a
                -- matching pg_constraint row, which the check above cannot
                -- see — makes ADD CONSTRAINT fail with 42P07 and, in the
                -- Supabase editor, rolls back the entire repair file.
                IF to_regclass(${lit(`public."${table}_pkey"`)}) IS NOT NULL THEN RETURN; END IF;

                EXECUTE format('UPDATE %I SET "id" = gen_random_uuid()::text WHERE "id" IS NULL OR "id" = ''''', ${lit(table)});

                EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM %I GROUP BY "id" HAVING count(*) > 1) d', ${lit(table)})
                    INTO dupes;
                IF dupes > 0 THEN
                    RAISE NOTICE '%: % duplicate id(s), leaving the table unkeyed', ${lit(table)}, dupes;
                    RETURN;
                END IF;

                EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I PRIMARY KEY ("id")', ${lit(table)}, ${lit(`${table}_pkey`)});
            EXCEPTION WHEN OTHERS THEN
                -- Same rule as the foreign keys below: the primary key is the
                -- least important thing in this file, and nothing may be
                -- sacrificed to add it. Never let it abort the transaction.
                RAISE NOTICE 'skipped primary key on %: %', ${lit(table)}, SQLERRM;
            END $do$`

async function ensurePrimaryKey(table: string): Promise<void> {
    try { await exec(primaryKeyStatement(table)) }
    catch (e) { console.error(`[PAYROLL_SCHEMA_ENSURE] primary key ${table}`, e) }
}

const TABLES: [string, Col[]][] = [["PayrollRun", PAYROLL_RUN], ["Payroll", PAYROLL]]

const enumStatement = () => `
DO $do$ BEGIN
    CREATE TYPE "PayrollStatus" AS ENUM (${PAYROLL_STATUS_VALUES.map(lit).join(", ")});
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$`

// Only the PK is created here; everything else goes through the three reconcile
// passes, so a fresh table and a stale one end up identical.
const createTableStatement = (table: string) => `
CREATE TABLE IF NOT EXISTS "${table}" (
    "id" TEXT NOT NULL,
    CONSTRAINT "${table}_pkey" PRIMARY KEY ("id")
)`

const INDEX_STATEMENTS = [
    `CREATE UNIQUE INDEX IF NOT EXISTS "PayrollRun_month_year_key" ON "PayrollRun"("month", "year")`,
    `CREATE INDEX IF NOT EXISTS "PayrollRun_status_idx" ON "PayrollRun"("status")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Payroll_employeeId_month_year_key" ON "Payroll"("employeeId", "month", "year")`,
    `CREATE INDEX IF NOT EXISTS "Payroll_month_year_idx"   ON "Payroll"("month", "year")`,
    `CREATE INDEX IF NOT EXISTS "Payroll_status_idx"       ON "Payroll"("status")`,
    `CREATE INDEX IF NOT EXISTS "Payroll_employeeId_idx"   ON "Payroll"("employeeId")`,
    `CREATE INDEX IF NOT EXISTS "Payroll_payrollRunId_idx" ON "Payroll"("payrollRunId")`,
]

// Constraints have no IF NOT EXISTS. At runtime any failure is caught in JS; the
// generated .sql wraps each one in its own DO block that swallows EVERYTHING,
// because the Supabase editor runs the file as a single transaction and one
// unhandled error rolls back the whole repair — which is exactly what happened
// when a missing primary key on PayrollRun made the second FK fail with 42830
// and took every column fix down with it. These constraints are the least
// important thing in this file; nothing may be sacrificed to add them.
const FOREIGN_KEY_STATEMENTS = [
    `ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_employeeId_fkey"
     FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE`,
    `ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_payrollRunId_fkey"
     FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
]

// Exported so scripts/gen-payroll-schema-sql.ts can emit the manual Supabase
// equivalent from this exact spec. Hand-maintaining a parallel .sql is what let
// the two drift before; now there is one source and the file is generated.
export function payrollSchemaSql(): { ddl: string[]; foreignKeys: string[] } {
    const ddl = [enumStatement()]
    for (const [table, cols] of TABLES) {
        ddl.push(createTableStatement(table))
        const legacy = legacyCaseStatement(table, cols)
        if (legacy) ddl.push(legacy)
        ddl.push(addColumnsStatement(table, cols))
        ddl.push(typeReconcileStatement(table, cols))
        ddl.push(primaryKeyStatement(table))
    }
    ddl.push(...INDEX_STATEMENTS)
    return { ddl, foreignKeys: FOREIGN_KEY_STATEMENTS }
}

async function run(): Promise<void> {
    try {
        await exec(enumStatement())

        for (const [table, cols] of TABLES) {
            await exec(createTableStatement(table))
            await reconcileLegacyCase(table, cols)
            await addColumns(table, cols)
            await reconcileTypes(table, cols)
            await ensurePrimaryKey(table)
        }

        for (const statement of INDEX_STATEMENTS) await exec(statement)
        for (const fk of FOREIGN_KEY_STATEMENTS) {
            try { await exec(fk) } catch { /* already present */ }
        }

        ensured = true
    } catch (e) {
        // Best effort — retried on the next call rather than cached as done.
        console.error("[PAYROLL_SCHEMA_ENSURE]", e)
    }
}
