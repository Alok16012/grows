-- Polls and surveys for Announcements (Announcements → Polls / Surveys).
--
-- New tables only; nothing existing is altered. Until this runs every
-- /api/polls and /api/surveys route answers 503 and the two tabs say the
-- module is not set up, so deploying the code first breaks nothing.
--
-- Production migrations are applied by hand, so every statement is idempotent
-- and safe to paste into the Supabase SQL editor and re-run.
-- Same SQL lives in scripts/polls-surveys.sql.

CREATE TABLE IF NOT EXISTS "Poll" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "description" TEXT,
    "options" JSONB NOT NULL,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "resultsVisibility" TEXT NOT NULL DEFAULT 'AFTER_VOTE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closesAt" TIMESTAMP(3),
    "targetSiteIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Poll_status_idx" ON "Poll"("status");
CREATE INDEX IF NOT EXISTS "Poll_createdAt_idx" ON "Poll"("createdAt");

CREATE TABLE IF NOT EXISTS "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PollVote_pollId_userId_key" ON "PollVote"("pollId", "userId");
CREATE INDEX IF NOT EXISTS "PollVote_pollId_idx" ON "PollVote"("pollId");
DO $$ BEGIN
    ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey"
        FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Survey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "questions" JSONB NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "closesAt" TIMESTAMP(3),
    "targetSiteIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Survey_status_idx" ON "Survey"("status");
CREATE INDEX IF NOT EXISTS "Survey_createdAt_idx" ON "Survey"("createdAt");

CREATE TABLE IF NOT EXISTS "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SurveyResponse_surveyId_userId_key" ON "SurveyResponse"("surveyId", "userId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_surveyId_idx" ON "SurveyResponse"("surveyId");
DO $$ BEGIN
    ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey"
        FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
