-- Job posting: add a direct Google Maps link (exact pin) for the job page.
-- Additive & nullable so existing rows stay valid.

ALTER TABLE "JobPosting"
    ADD COLUMN IF NOT EXISTS "mapUrl" TEXT;
