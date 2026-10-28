-- Employee statutory switches: PF Applicable, PF Pension (EPS) Applicable and
-- ESIC Applicable, set from Employee Master -> Edit Employee -> Basic Info.
--
-- A NEW table, linked to "Employee" by foreign key, so deploying the code
-- before this SQL runs breaks nothing: until the table exists every employee
-- is treated as PF / pension / ESIC applicable (exactly the old behaviour) and
-- the three checkboxes say the feature isn't set up yet.
--
-- Production migrations are applied by hand, so every statement is idempotent
-- and safe to paste into the Supabase SQL editor and re-run.
-- Same SQL lives in prisma/migrations/20261028120000_employee_statutory.

CREATE TABLE IF NOT EXISTS "EmployeeStatutory" (
    "employeeId" TEXT NOT NULL,
    "pfApplicable" BOOLEAN NOT NULL DEFAULT true,
    "pensionApplicable" BOOLEAN NOT NULL DEFAULT true,
    "esicApplicable" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeStatutory_pkey" PRIMARY KEY ("employeeId")
);

DO $$ BEGIN
    ALTER TABLE "EmployeeStatutory" ADD CONSTRAINT "EmployeeStatutory_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The app connects as "postgres"; make sure it can write the new table even
-- when this script is run as another role (see scripts/fix-grants-new-tables.sql).
GRANT ALL ON TABLE "EmployeeStatutory" TO postgres;
