-- The columns lib/prisma.ts `ensureProjectSchema` has been creating at runtime.
--
-- They were added to the Prisma model after production was provisioned, and
-- migrations don't run on deploy here, so the code healed the schema itself on
-- every cold start — five ALTER TABLE statements the Projects page waited on
-- before it could load.
--
-- Once this has been applied everywhere, `ensureProjectSchema` and the
-- `await ensureProjectSchema()` calls in the project / assignment / admin-stats
-- routes can be deleted outright.
--
-- Every statement is idempotent, so running it on a database that already has
-- the columns is a no-op.

ALTER TABLE "Project"
    ADD COLUMN IF NOT EXISTS "code"        TEXT,
    ADD COLUMN IF NOT EXISTS "status"      TEXT NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN IF NOT EXISTS "projectType" TEXT,
    ADD COLUMN IF NOT EXISTS "priority"    TEXT,
    ADD COLUMN IF NOT EXISTS "startDate"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "endDate"     TIMESTAMP(3);

ALTER TABLE "Assignment"
    ADD COLUMN IF NOT EXISTS "code"      TEXT,
    ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "notes"     TEXT;

-- Company and Branch are retired — projects hang off Sites, and sites and
-- departments stand alone. The legacy columns stay for existing rows but become
-- nullable so new rows never need them.
ALTER TABLE "Project"    ALTER COLUMN "companyId" DROP NOT NULL;
ALTER TABLE "Site"       ALTER COLUMN "branchId"  DROP NOT NULL;
ALTER TABLE "Department" ALTER COLUMN "branchId"  DROP NOT NULL;
