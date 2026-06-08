-- Job posting portal: internal "Post a job" wizard.

-- JobStatus enum (guarded so re-runs / drift don't error).
DO $$ BEGIN
    CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "JobPosting" (
    "id"                 TEXT NOT NULL,
    "title"              TEXT NOT NULL,
    "workExpMin"         INTEGER,
    "workExpMax"         INTEGER,
    "freshersAllowed"    BOOLEAN NOT NULL DEFAULT false,
    "salaryMin"          INTEGER,
    "salaryMax"          INTEGER,
    "salaryPeriod"       TEXT NOT NULL DEFAULT 'month',
    "perks"              TEXT[] DEFAULT ARRAY[]::TEXT[],
    "department"         TEXT,
    "jobRole"            TEXT,
    "jobLocation"        TEXT,
    "qualifications"     TEXT[] DEFAULT ARRAY[]::TEXT[],
    "educationDegree"    TEXT,
    "genderPreference"   TEXT NOT NULL DEFAULT 'Any',
    "skills"             TEXT[] DEFAULT ARRAY[]::TEXT[],
    "candidateIndustry"  TEXT,
    "languages"          TEXT[] DEFAULT ARRAY[]::TEXT[],
    "screeningQuestions" JSONB,
    "description"        TEXT,
    "companyName"        TEXT,
    "employmentType"     TEXT,
    "industryType"       TEXT,
    "roleCategory"       TEXT,
    "openings"           INTEGER NOT NULL DEFAULT 1,
    "allowCalls"         BOOLEAN NOT NULL DEFAULT false,
    "contactName"        TEXT,
    "contactPhone"       TEXT,
    "callStartTime"      TEXT,
    "callEndTime"        TEXT,
    "callDays"           TEXT,
    "status"             "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy"          TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JobPosting_status_idx"    ON "JobPosting"("status");
CREATE INDEX IF NOT EXISTS "JobPosting_createdBy_idx" ON "JobPosting"("createdBy");

DO $$ BEGIN
    ALTER TABLE "JobPosting"
        ADD CONSTRAINT "JobPosting_createdBy_fkey"
        FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
