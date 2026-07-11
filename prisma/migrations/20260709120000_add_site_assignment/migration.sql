-- "Whole Site" grants: an inspector assigned to a Site (Company) as a whole,
-- so projects added later are auto-assigned to them.
CREATE TABLE IF NOT EXISTS "SiteAssignment" (
    "id"              TEXT NOT NULL,
    "companyId"       TEXT NOT NULL,
    "inspectionBoyId" TEXT NOT NULL,
    "assignedBy"      TEXT NOT NULL,
    "recurrenceType"  TEXT NOT NULL DEFAULT 'none',
    "status"          TEXT NOT NULL DEFAULT 'active',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SiteAssignment_companyId_inspectionBoyId_key"
    ON "SiteAssignment"("companyId", "inspectionBoyId");

CREATE INDEX IF NOT EXISTS "SiteAssignment_companyId_idx"
    ON "SiteAssignment"("companyId");

CREATE INDEX IF NOT EXISTS "SiteAssignment_inspectionBoyId_idx"
    ON "SiteAssignment"("inspectionBoyId");

DO $$ BEGIN
    ALTER TABLE "SiteAssignment"
        ADD CONSTRAINT "SiteAssignment_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "SiteAssignment"
        ADD CONSTRAINT "SiteAssignment_inspectionBoyId_fkey"
        FOREIGN KEY ("inspectionBoyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "SiteAssignment"
        ADD CONSTRAINT "SiteAssignment_assignedBy_fkey"
        FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
