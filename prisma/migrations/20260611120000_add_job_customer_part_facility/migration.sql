-- Job posting: add sample/inspection-part, customer location, and facility fields.
-- All additive & nullable (booleans default false) so existing rows stay valid.

ALTER TABLE "JobPosting"
    ADD COLUMN IF NOT EXISTS "partSectionLabel"       TEXT,
    ADD COLUMN IF NOT EXISTS "partName"               TEXT,
    ADD COLUMN IF NOT EXISTS "partMaterial"           TEXT,
    ADD COLUMN IF NOT EXISTS "partPhotoUrl"           TEXT,
    ADD COLUMN IF NOT EXISTS "inspectionType"         TEXT,
    ADD COLUMN IF NOT EXISTS "qualityStandard"        TEXT,
    ADD COLUMN IF NOT EXISTS "customerName"           TEXT,
    ADD COLUMN IF NOT EXISTS "plantLocation"          TEXT,
    ADD COLUMN IF NOT EXISTS "plantAddress"           TEXT,
    ADD COLUMN IF NOT EXISTS "shiftType"              TEXT,
    ADD COLUMN IF NOT EXISTS "weeklyOff"              TEXT,
    ADD COLUMN IF NOT EXISTS "overtimePolicy"         TEXT,
    ADD COLUMN IF NOT EXISTS "canteenAvailable"       BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "transportAvailable"     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "accommodationAvailable" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "busFacility"            BOOLEAN NOT NULL DEFAULT false;
