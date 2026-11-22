-- Jobs & Refer: who referred a candidate. Idempotent; adds only.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "referredBy" TEXT;
CREATE INDEX IF NOT EXISTS "Lead_referredBy_idx" ON "Lead" ("referredBy");
