-- LMS engagement tracking. Idempotent.
ALTER TABLE "CourseModule" ADD COLUMN IF NOT EXISTS "docUrl" TEXT;
CREATE TABLE IF NOT EXISTS "ModuleProgress" (
  "id" TEXT PRIMARY KEY,
  "enrollmentId" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "activeSeconds" INTEGER NOT NULL DEFAULT 0,
  "videoDuration" DOUBLE PRECISION,
  "watchedSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "watchedRanges" JSONB,
  "forwardSkips" INTEGER NOT NULL DEFAULT 0,
  "docPages" INTEGER,
  "pagesSeen" JSONB,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ModuleProgress_enrollmentId_moduleId_key" ON "ModuleProgress"("enrollmentId", "moduleId");
CREATE INDEX IF NOT EXISTS "ModuleProgress_employeeId_idx" ON "ModuleProgress"("employeeId");
CREATE INDEX IF NOT EXISTS "ModuleProgress_moduleId_idx" ON "ModuleProgress"("moduleId")
