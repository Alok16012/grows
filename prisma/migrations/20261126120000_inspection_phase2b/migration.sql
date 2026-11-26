BEGIN;
-- Inspection Phase 2b: form versioning + NCR / CAPA (8D). Idempotent.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "formVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "formVersion" INTEGER;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "formSnapshot" JSONB;
CREATE TABLE IF NOT EXISTS "Ncr" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "severity" TEXT NOT NULL DEFAULT 'MAJOR',
  "inspectionId" TEXT,
  "projectId" TEXT,
  "defectTypeId" TEXT,
  "partName" TEXT,
  "lotNumber" TEXT,
  "qtyInspected" INTEGER,
  "qtyAffected" INTEGER,
  "ownerUserId" TEXT,
  "dueDate" TIMESTAMP(3),
  "d1Team" TEXT,
  "d2Problem" TEXT,
  "d3Containment" TEXT,
  "d3Date" TIMESTAMP(3),
  "d4RootCause" TEXT,
  "d4Whys" JSONB,
  "d5Action" TEXT,
  "d6Implemented" TEXT,
  "d6Date" TIMESTAMP(3),
  "d7Prevention" TEXT,
  "d8Closure" TEXT,
  "effective" BOOLEAN,
  "closedAt" TIMESTAMP(3),
  "closedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Ncr_code_key" ON "Ncr"("code");
CREATE INDEX IF NOT EXISTS "Ncr_status_idx" ON "Ncr"("status");
CREATE INDEX IF NOT EXISTS "Ncr_inspectionId_idx" ON "Ncr"("inspectionId");
CREATE INDEX IF NOT EXISTS "Ncr_projectId_idx" ON "Ncr"("projectId");
CREATE INDEX IF NOT EXISTS "Ncr_ownerUserId_idx" ON "Ncr"("ownerUserId");
CREATE TABLE IF NOT EXISTS "NcrEvent" (
  "id" TEXT PRIMARY KEY,
  "ncrId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "NcrEvent_ncrId_idx" ON "NcrEvent"("ncrId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"Ncr"'::regclass AND conname = 'Ncr_inspectionId_fkey') THEN
    ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"Ncr"'::regclass AND conname = 'Ncr_projectId_fkey') THEN
    ALTER TABLE "Ncr" ADD CONSTRAINT "Ncr_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = '"NcrEvent"'::regclass AND conname = 'NcrEvent_ncrId_fkey') THEN
    ALTER TABLE "NcrEvent" ADD CONSTRAINT "NcrEvent_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "Ncr"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "Ncr" ALTER COLUMN "updatedAt" DROP DEFAULT;
COMMIT;
