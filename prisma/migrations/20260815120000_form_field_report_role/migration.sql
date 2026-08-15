-- Explicit report mapping for form fields.
--
-- Report charts used to recognise fields purely by keywords in their label
-- ("location", "part name", "inspected", ...). Renaming a field in the Form
-- Builder therefore silently unmapped it and every affected chart collapsed
-- into the "Main"/"General" fallback bucket. reportRole records what a field
-- MEANS (PART_NAME, PART_NUMBER, LOCATION, SHIFT, INSPECTED, ACCEPTED, REWORK,
-- REJECTED) so the label can say anything.
--
-- Production migrations are applied by hand (DIRECT_URL is unset on Vercel) —
-- run this in the Supabase SQL editor. Idempotent, and ensureProjectSchema()
-- in lib/prisma.ts adds the same column at runtime as a fallback.

ALTER TABLE "FormTemplate"
    ADD COLUMN IF NOT EXISTS "reportRole" TEXT;
