-- Hide a form field instead of deleting it.
--
-- InspectionData.fieldId cascades on delete, so removing a FormTemplate row
-- erases that field's answer from every inspection ever submitted. Retiring a
-- question therefore had only a destructive option. isHidden keeps the field (and
-- all its history) while taking it off the inspection form.
--
-- Production migrations are applied by hand (DIRECT_URL is unset on Vercel).
-- Idempotent; ensureProjectSchema() in lib/prisma.ts adds it at runtime too.

ALTER TABLE "FormTemplate"
    ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false;
