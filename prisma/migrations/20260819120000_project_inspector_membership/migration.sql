-- Inspector membership, separate from work.
--
-- Managers always had ProjectManager. Inspectors had nothing, so "who is on this
-- project" was read off Assignment rows — which meant the project's Team step
-- created real work: ticking an inspector produced an active assignment in their
-- workspace as though a job had been issued. Assignments are issued from the
-- Assignments screen; this table records membership only.
--
-- Production migrations are applied by hand (DIRECT_URL is unset on Vercel).
-- Idempotent, and lib/prisma.ts -> ensureProjectSchema() performs the same steps
-- at runtime, including the backfill.

CREATE TABLE IF NOT EXISTS "ProjectInspector" (
    "id"          TEXT NOT NULL,
    "projectId"   TEXT NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "assignedBy"  TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectInspector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectInspector_projectId_inspectorId_key"
    ON "ProjectInspector"("projectId", "inspectorId");
CREATE INDEX IF NOT EXISTS "ProjectInspector_inspectorId_idx"
    ON "ProjectInspector"("inspectorId");

DO $$ BEGIN
    ALTER TABLE "ProjectInspector" ADD CONSTRAINT "ProjectInspector_projectId_fkey"
        FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "ProjectInspector" ADD CONSTRAINT "ProjectInspector_inspectorId_fkey"
        FOREIGN KEY ("inspectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    ALTER TABLE "ProjectInspector" ADD CONSTRAINT "ProjectInspector_assignedBy_fkey"
        FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Carry existing membership over from the assignments that were standing in for
-- it, so nobody falls off a project when this ships.
INSERT INTO "ProjectInspector" ("id", "projectId", "inspectorId", "assignedBy", "createdAt")
SELECT gen_random_uuid()::text, a."projectId", a."inspectionBoyId", a."assignedBy", MIN(a."createdAt")
FROM "Assignment" a
WHERE a."status" <> 'inactive'
GROUP BY a."projectId", a."inspectionBoyId", a."assignedBy"
ON CONFLICT ("projectId", "inspectorId") DO NOTHING;
