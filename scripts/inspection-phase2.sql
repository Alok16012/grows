-- Inspection Phase 2: central defect library. Idempotent.
CREATE TABLE IF NOT EXISTS "DefectType" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'MINOR',
  "category" TEXT,
  "description" TEXT,
  "photoUrl" TEXT,
  "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DefectType_code_key" ON "DefectType"("code");
ALTER TABLE "FormTemplate" ADD COLUMN IF NOT EXISTS "defectTypeId" TEXT;
CREATE INDEX IF NOT EXISTS "FormTemplate_defectTypeId_idx" ON "FormTemplate"("defectTypeId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FormTemplate_defectTypeId_fkey') THEN
    ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_defectTypeId_fkey" FOREIGN KEY ("defectTypeId") REFERENCES "DefectType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$
