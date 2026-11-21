-- LMS Phase 2: skill matrix + on-the-job sign-off. Idempotent.
CREATE TABLE IF NOT EXISTS "Skill" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'PROCESS',
  "siteId" TEXT,
  "courseId" TEXT,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Skill_code_key" ON "Skill"("code");
CREATE INDEX IF NOT EXISTS "Skill_siteId_idx" ON "Skill"("siteId");
CREATE INDEX IF NOT EXISTS "Skill_courseId_idx" ON "Skill"("courseId");
CREATE TABLE IF NOT EXISTS "EmployeeSkill" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "level" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "assessedBy" TEXT,
  "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeSkill_employeeId_skillId_key" ON "EmployeeSkill"("employeeId", "skillId");
CREATE INDEX IF NOT EXISTS "EmployeeSkill_employeeId_idx" ON "EmployeeSkill"("employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeSkill_skillId_idx" ON "EmployeeSkill"("skillId");
CREATE TABLE IF NOT EXISTS "OjtSignoff" (
  "id" TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "skillId" TEXT NOT NULL,
  "level" INTEGER NOT NULL,
  "supervisorUserId" TEXT NOT NULL,
  "notes" TEXT,
  "photoUrl" TEXT,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OjtSignoff_employeeId_idx" ON "OjtSignoff"("employeeId");
CREATE INDEX IF NOT EXISTS "OjtSignoff_skillId_idx" ON "OjtSignoff"("skillId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmployeeSkill_skillId_fkey') THEN
    ALTER TABLE "EmployeeSkill" ADD CONSTRAINT "EmployeeSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OjtSignoff_skillId_fkey') THEN
    ALTER TABLE "OjtSignoff" ADD CONSTRAINT "OjtSignoff_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$
