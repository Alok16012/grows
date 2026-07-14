-- Inspection flow now uses the real HR "Site" model instead of "Company".
-- 1) Projects gain a nullable link to a real Site.
-- 2) SiteAssignment (a never-deployed "whole site" grant) is retargeted from
--    Company to the real Site. It carries no production data yet, so we can
--    safely drop and recreate it.

-- ---------------------------------------------------------------------------
-- Project.siteId -> Site
-- ---------------------------------------------------------------------------
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "siteId" TEXT;

CREATE INDEX IF NOT EXISTS "Project_siteId_idx" ON "Project"("siteId");

DO $$ BEGIN
    ALTER TABLE "Project"
        ADD CONSTRAINT "Project_siteId_fkey"
        FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Retarget SiteAssignment: companyId -> siteId
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "SiteAssignment" CASCADE;

CREATE TABLE "SiteAssignment" (
    "id"              TEXT NOT NULL,
    "siteId"          TEXT NOT NULL,
    "inspectionBoyId" TEXT NOT NULL,
    "assignedBy"      TEXT NOT NULL,
    "recurrenceType"  TEXT NOT NULL DEFAULT 'none',
    "status"          TEXT NOT NULL DEFAULT 'active',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteAssignment_siteId_inspectionBoyId_key"
    ON "SiteAssignment"("siteId", "inspectionBoyId");

CREATE INDEX "SiteAssignment_siteId_idx" ON "SiteAssignment"("siteId");

CREATE INDEX "SiteAssignment_inspectionBoyId_idx" ON "SiteAssignment"("inspectionBoyId");

ALTER TABLE "SiteAssignment"
    ADD CONSTRAINT "SiteAssignment_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SiteAssignment"
    ADD CONSTRAINT "SiteAssignment_inspectionBoyId_fkey"
    FOREIGN KEY ("inspectionBoyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SiteAssignment"
    ADD CONSTRAINT "SiteAssignment_assignedBy_fkey"
    FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
