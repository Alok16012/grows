ALTER TABLE "Expense"
    ADD COLUMN IF NOT EXISTS "travelEntries" JSONB;
