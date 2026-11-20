-- Inspection Phase 1: defect photos, customer sign-off. Idempotent.
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "defectPhotos" JSONB;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "customerSignature" TEXT;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "customerSignedName" TEXT;
ALTER TABLE "Inspection" ADD COLUMN IF NOT EXISTS "customerSignedAt" TIMESTAMP(3);
