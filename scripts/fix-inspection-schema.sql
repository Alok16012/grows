-- =====================================================================
-- Inspection flow schema fix (run once in Supabase → SQL Editor)
-- =====================================================================
-- Fixes:
--   1) Project.siteId column missing  -> "create project" fails
--   2) ProjectManager table missing   -> managers cannot be attached
--
-- Safe & idempotent. Re-running does nothing harmful.
-- NOTE: SiteAssignment is intentionally NOT touched here — the Prisma
-- migration handles it, and creating it manually would break a later
-- `prisma migrate deploy`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Project -> real HR Site link
-- ---------------------------------------------------------------------
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "siteId" TEXT;

CREATE INDEX IF NOT EXISTS "Project_siteId_idx" ON "Project"("siteId");

DO $$ BEGIN
    ALTER TABLE "Project"
        ADD CONSTRAINT "Project_siteId_fkey"
        FOREIGN KEY ("siteId") REFERENCES "Site"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 2) ProjectManager (Managers added at the Project level)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ProjectManager" (
    "id"         TEXT NOT NULL,
    "projectId"  TEXT NOT NULL,
    "managerId"  TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectManager_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectManager_projectId_managerId_key"
    ON "ProjectManager"("projectId", "managerId");

DO $$ BEGIN
    ALTER TABLE "ProjectManager"
        ADD CONSTRAINT "ProjectManager_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ProjectManager"
        ADD CONSTRAINT "ProjectManager_managerId_fkey"
        FOREIGN KEY ("managerId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "ProjectManager"
        ADD CONSTRAINT "ProjectManager_assignedBy_fkey"
        FOREIGN KEY ("assignedBy") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
