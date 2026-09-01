-- ============================================================================
-- Core schema repair — Project / Assignment / FormTemplate / ProjectInspector,
--                      HrDocument recall, User.signature, SiteAssignment
-- ============================================================================
--
-- WHY THIS EXISTS: these tables used to be reconciled at runtime by
-- ensureProjectSchema (lib/prisma.ts), ensureHrDocRecallSchema and
-- ensureSiteAssignmentSchema. As of commit d10c6fb those heals are OFF in
-- production (lib/schema-selfheal.ts) because replaying their DDL in front of
-- every cold-start request is what produced FUNCTION_INVOCATION_TIMEOUT on the
-- payroll page. Prod schema is applied by hand instead — this file is that
-- hand.
--
-- Run this ONCE. It is idempotent: safe to re-run any time, and safe to run on
-- a database where some or all of it is already correct.
--
-- >>> THIS IS NOT THE WHOLE JOB. Payroll / PayrollRun live in their own
-- >>> GENERATED file. Run scripts/fix-payroll-schema.sql as well. It is not
-- >>> duplicated here on purpose: it is emitted from the spec in
-- >>> lib/payroll-schema.ts, and hand-maintaining a second copy is exactly how
-- >>> the two drifted apart before.
--
-- EVERY statement below sits in its own DO block that swallows errors into a
-- NOTICE. That is deliberate. The Supabase SQL editor runs a pasted file as ONE
-- transaction, so a single unhandled error rolls back every other fix in the
-- file — which is precisely what happened when a stray "PayrollRun_pkey" index
-- raised 42P07 and silently undid the entire payroll repair. Nothing here may
-- be allowed to abort the file. `NOTICE: skipped ...` in the output is normal
-- and means "already correct" far more often than it means "failed".
--
-- Nothing here drops a column, drops a table, or deletes a row.


-- ─── STEP 1 ─────────────────────────────────────────────────────────────────
-- RUN THIS ON ITS OWN, FIRST, IN A SEPARATE QUERY. Then run the rest.
--
-- A new enum value cannot be USED in the same transaction that creates it, so
-- it must be committed before anything else references 'RECALLED'.
--
--     ALTER TYPE "HrDocStatus" ADD VALUE IF NOT EXISTS 'RECALLED';
--
-- If it errors with `type "HrDocStatus" does not exist`, that is fine — this
-- deployment has no HR-documents enum yet. Move on to Step 2.


-- ─── STEP 2 ─────────────────────────────────────────────────────────────────
-- Everything below can be pasted and run in one go.


-- ── Project workflow columns ────────────────────────────────────────────────
DO $do$ BEGIN
    ALTER TABLE "Project"
        ADD COLUMN IF NOT EXISTS "code"        TEXT,
        ADD COLUMN IF NOT EXISTS "status"      TEXT NOT NULL DEFAULT 'ACTIVE',
        ADD COLUMN IF NOT EXISTS "projectType" TEXT,
        ADD COLUMN IF NOT EXISTS "priority"    TEXT,
        ADD COLUMN IF NOT EXISTS "startDate"   TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "endDate"     TIMESTAMP(3);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped Project columns: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    ALTER TABLE "Assignment"
        ADD COLUMN IF NOT EXISTS "code"        TEXT,
        ADD COLUMN IF NOT EXISTS "startDate"   TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "notes"       TEXT,
        ADD COLUMN IF NOT EXISTS "isMultiPart" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped Assignment columns: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    ALTER TABLE "FormTemplate"
        ADD COLUMN IF NOT EXISTS "reportRole" TEXT,
        ADD COLUMN IF NOT EXISTS "isHidden"   BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped FormTemplate columns: %', SQLERRM;
END $do$;


-- ── ProjectInspector ────────────────────────────────────────────────────────
-- Inspector membership. Managers always had ProjectManager; inspectors'
-- membership used to be inferred from Assignment rows, which is why putting
-- someone on a project's Team handed them work.
DO $do$ BEGIN
    CREATE TABLE IF NOT EXISTS "ProjectInspector" (
        "id"          TEXT NOT NULL,
        "projectId"   TEXT NOT NULL,
        "inspectorId" TEXT NOT NULL,
        "assignedBy"  TEXT NOT NULL,
        "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProjectInspector_pkey" PRIMARY KEY ("id")
    );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped ProjectInspector table: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "ProjectInspector_projectId_inspectorId_key"
        ON "ProjectInspector"("projectId", "inspectorId");
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped ProjectInspector unique index: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    CREATE INDEX IF NOT EXISTS "ProjectInspector_inspectorId_idx"
        ON "ProjectInspector"("inspectorId");
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped ProjectInspector index: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    ALTER TABLE "ProjectInspector" ADD CONSTRAINT "ProjectInspector_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped ProjectInspector projectId fkey: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    ALTER TABLE "ProjectInspector" ADD CONSTRAINT "ProjectInspector_inspectorId_fkey"
        FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped ProjectInspector inspectorId fkey: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    ALTER TABLE "ProjectInspector" ADD CONSTRAINT "ProjectInspector_assignedBy_fkey"
        FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped ProjectInspector assignedBy fkey: %', SQLERRM;
END $do$;

-- Backfill membership from the assignments that were standing in for it, so
-- nobody drops off a project. Idempotent via ON CONFLICT DO NOTHING.
DO $do$ BEGIN
    INSERT INTO "ProjectInspector" ("id", "projectId", "inspectorId", "assignedBy", "createdAt")
    SELECT gen_random_uuid()::text, a."projectId", a."inspectionBoyId", a."assignedBy", MIN(a."createdAt")
    FROM "Assignment" a
    WHERE a."status" <> 'inactive'
    GROUP BY a."projectId", a."inspectionBoyId", a."assignedBy"
    ON CONFLICT ("projectId", "inspectorId") DO NOTHING;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped ProjectInspector backfill: %', SQLERRM;
END $do$;


-- ── Retired Company/Branch links ────────────────────────────────────────────
-- Projects hang off Sites now; sites/departments stand alone. Legacy columns
-- stay but become nullable so new rows never need them.
DO $do$ BEGIN
    ALTER TABLE "Project" ALTER COLUMN "companyId" DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped Project.companyId: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    ALTER TABLE "Site" ALTER COLUMN "branchId" DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped Site.branchId: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    ALTER TABLE "Department" ALTER COLUMN "branchId" DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped Department.branchId: %', SQLERRM;
END $do$;


-- ── HR document recall ──────────────────────────────────────────────────────
DO $do$ BEGIN
    ALTER TABLE "HrDocument"
        ADD COLUMN IF NOT EXISTS "recalledBy"   TEXT,
        ADD COLUMN IF NOT EXISTS "recalledAt"   TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "recallReason" TEXT,
        ADD COLUMN IF NOT EXISTS "recallCount"  INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "history"      JSONB,
        ADD COLUMN IF NOT EXISTS "signature"    TEXT;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped HrDocument columns: %', SQLERRM;
END $do$;

-- Per-sender saved signature. Deliberately NOT in the Prisma User model: User
-- rows are read during login, before any ensure ran, so a schema-modelled
-- column would have 500'd auth until it existed.
DO $do$ BEGIN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signature" TEXT;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped User.signature: %', SQLERRM;
END $do$;


-- ── SiteAssignment ──────────────────────────────────────────────────────────
-- The "Whole Site" grant behind the Assignments wizard.
DO $do$ BEGIN
    CREATE TABLE IF NOT EXISTS "SiteAssignment" (
        "id"              TEXT NOT NULL,
        "siteId"          TEXT NOT NULL,
        "inspectionBoyId" TEXT NOT NULL,
        "assignedBy"      TEXT NOT NULL,
        "recurrenceType"  TEXT NOT NULL DEFAULT 'none',
        "status"          TEXT NOT NULL DEFAULT 'active',
        "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SiteAssignment_pkey" PRIMARY KEY ("id")
    );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped SiteAssignment table: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "SiteAssignment_siteId_inspectionBoyId_key"
        ON "SiteAssignment"("siteId", "inspectionBoyId");
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped SiteAssignment unique index: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    CREATE INDEX IF NOT EXISTS "SiteAssignment_siteId_idx" ON "SiteAssignment"("siteId");
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped SiteAssignment siteId index: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    CREATE INDEX IF NOT EXISTS "SiteAssignment_inspectionBoyId_idx" ON "SiteAssignment"("inspectionBoyId");
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped SiteAssignment inspectionBoyId index: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_siteId_fkey"
        FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped SiteAssignment siteId fkey: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_inspectionBoyId_fkey"
        FOREIGN KEY ("inspectionBoyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped SiteAssignment inspectionBoyId fkey: %', SQLERRM;
END $do$;

DO $do$ BEGIN
    ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_assignedBy_fkey"
        FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'skipped SiteAssignment assignedBy fkey: %', SQLERRM;
END $do$;


-- ─── STEP 3 — Verify ────────────────────────────────────────────────────────
-- Every row below should report present = true. Anything false is a real gap:
-- re-read the NOTICE for that item in the output above.

SELECT 'Project.status'            AS item, to_regclass('public."Project"')          IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Project'          AND column_name='status')      AS present
UNION ALL SELECT 'Assignment.isMultiPart',       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Assignment'      AND column_name='isMultiPart')
UNION ALL SELECT 'FormTemplate.isHidden',        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='FormTemplate'    AND column_name='isHidden')
UNION ALL SELECT 'ProjectInspector table',       to_regclass('public."ProjectInspector"') IS NOT NULL
UNION ALL SELECT 'HrDocument.recallCount',       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='HrDocument'      AND column_name='recallCount')
UNION ALL SELECT 'User.signature',               EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='User'            AND column_name='signature')
UNION ALL SELECT 'SiteAssignment table',         to_regclass('public."SiteAssignment"')   IS NOT NULL
UNION ALL SELECT 'Payroll table (other file!)',  to_regclass('public."Payroll"')          IS NOT NULL
UNION ALL SELECT 'PayrollRun table (other file!)', to_regclass('public."PayrollRun"')     IS NOT NULL
ORDER BY item;

-- Nullable-again legacy columns: expect is_nullable = YES for each row present.
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (table_name, column_name) IN (('Project','companyId'), ('Site','branchId'), ('Department','branchId'))
ORDER BY table_name;
