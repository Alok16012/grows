-- One expense (one title) can now hold multiple category line-items.
-- Additive & nullable so existing rows stay valid; legacy `category`/`amount`
-- stay populated (amount = sum of items, category = first item) for back-compat.

ALTER TABLE "Expense"
    ADD COLUMN IF NOT EXISTS "categoryItems" JSONB;
