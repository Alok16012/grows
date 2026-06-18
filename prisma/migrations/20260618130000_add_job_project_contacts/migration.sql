ALTER TABLE "JobPosting"
    ADD COLUMN IF NOT EXISTS "projectManagers"    JSONB,
    ADD COLUMN IF NOT EXISTS "projectSupervisors" JSONB;
