-- Multi-part assignments.
--
-- An assignment marked multi-part is inspected over several visits: the
-- inspector may start a new report once the previous part is submitted, and
-- approving a part does not close the assignment. It stays on their list until
-- a manager closes it deliberately.
--
-- Production migrations are applied by hand on this project (DIRECT_URL is not
-- set on Vercel), so run this in the Supabase SQL editor. It is idempotent, and
-- lib/prisma.ts -> ensureProjectSchema() adds the same column at runtime as a
-- fallback, so the app keeps working if this has not been run yet.

ALTER TABLE "Assignment"
    ADD COLUMN IF NOT EXISTS "isMultiPart" BOOLEAN NOT NULL DEFAULT false;
