-- Recruitment v2: manpower requests, interview rounds, offers, merge log. Idempotent; adds only.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "jobId"            TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "requestId"        TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "stageChangedAt"   TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "offeredSalary"    DOUBLE PRECISION;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "offerDesignation" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "offerJoiningDate" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "offeredAt"        TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "offerToken"       TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Lead_offerToken_key" ON "Lead" ("offerToken");
CREATE INDEX IF NOT EXISTS "Lead_jobId_idx" ON "Lead" ("jobId");
CREATE INDEX IF NOT EXISTS "Lead_requestId_idx" ON "Lead" ("requestId");
CREATE INDEX IF NOT EXISTS "Lead_phone_idx" ON "Lead" ("phone");
-- Existing candidates: stage clock starts at their last update.
UPDATE "Lead" SET "stageChangedAt" = "updatedAt" WHERE "stageChangedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "ManpowerRequest" (
  "id"          TEXT PRIMARY KEY,
  "reqNo"       TEXT NOT NULL UNIQUE,
  "siteId"      TEXT,
  "siteName"    TEXT,
  "position"    TEXT NOT NULL,
  "headcount"   INTEGER NOT NULL DEFAULT 1,
  "reason"      TEXT NOT NULL DEFAULT 'NEW',
  "neededBy"    TIMESTAMP(3),
  "salaryMin"   INTEGER,
  "salaryMax"   INTEGER,
  "notes"       TEXT,
  "priority"    TEXT NOT NULL DEFAULT 'MEDIUM',
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "requestedBy" TEXT NOT NULL,
  "decidedBy"   TEXT,
  "decidedAt"   TIMESTAMP(3),
  "decisionNote" TEXT,
  "jobId"       TEXT,
  "closedAt"    TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ManpowerRequest_status_idx" ON "ManpowerRequest" ("status");
CREATE INDEX IF NOT EXISTS "ManpowerRequest_site_idx" ON "ManpowerRequest" ("siteId");

CREATE TABLE IF NOT EXISTS "LeadInterview" (
  "id"            TEXT PRIMARY KEY,
  "leadId"        TEXT NOT NULL REFERENCES "Lead"("id") ON DELETE CASCADE,
  "round"         INTEGER NOT NULL DEFAULT 1,
  "title"         TEXT NOT NULL DEFAULT 'Interview',
  "scheduledAt"   TIMESTAMP(3) NOT NULL,
  "mode"          TEXT,
  "location"      TEXT,
  "interviewerId" TEXT,
  "status"        TEXT NOT NULL DEFAULT 'SCHEDULED',
  "result"        TEXT,
  "scores"        JSONB,
  "feedback"      TEXT,
  "createdBy"     TEXT NOT NULL,
  "completedAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "LeadInterview_lead_idx" ON "LeadInterview" ("leadId");
CREATE INDEX IF NOT EXISTS "LeadInterview_when_idx" ON "LeadInterview" ("scheduledAt", "status");
CREATE INDEX IF NOT EXISTS "LeadInterview_interviewer_idx" ON "LeadInterview" ("interviewerId");

-- Every merged-away candidate is kept here in full, so a merge can be checked or undone by hand.
CREATE TABLE IF NOT EXISTS "LeadMergeLog" (
  "id"         TEXT PRIMARY KEY,
  "keptId"     TEXT NOT NULL,
  "removedId"  TEXT NOT NULL,
  "snapshot"   JSONB NOT NULL,
  "mergedBy"   TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "LeadMergeLog_kept_idx" ON "LeadMergeLog" ("keptId");
