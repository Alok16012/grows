-- Payroll."presentDays" INTEGER -> DOUBLE PRECISION.
--
-- Attendance sheets carry half days: a row reading 10.50 DAYS is normal. The
-- column was an int, so everything after the decimal point was lost on the way
-- in and the employee was paid for 10 or 11 days instead of 10.5.
--
-- "workingDays" stays an int on purpose — the month's standard days (26) is
-- always whole. "lwpDays" is already a float, so monthDays - workedDays lands
-- there without rounding.
--
-- Production migrations are applied by hand (DIRECT_URL is unset on Vercel);
-- scripts/fix-payroll-schema.sql carries the same change for that path.
-- Idempotent: the type is only altered when it is not already float8.

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'Payroll'
          AND column_name  = 'presentDays'
          AND udt_name     <> 'float8'
    ) THEN
        -- The old default is typed in the old type, so it has to go first.
        ALTER TABLE "Payroll" ALTER COLUMN "presentDays" DROP DEFAULT;
        ALTER TABLE "Payroll" ALTER COLUMN "presentDays" TYPE DOUBLE PRECISION
            USING NULLIF("presentDays"::text, '')::double precision;
        ALTER TABLE "Payroll" ALTER COLUMN "presentDays" SET DEFAULT 26;
        ALTER TABLE "Payroll" ALTER COLUMN "presentDays" SET NOT NULL;
    END IF;
END $$;
