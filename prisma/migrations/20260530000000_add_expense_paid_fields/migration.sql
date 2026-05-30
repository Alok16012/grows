-- Add paidAt and paymentMode to Expense table
-- These were in the schema but never migrated, causing SELECT failures.
ALTER TABLE "Expense"
    ADD COLUMN IF NOT EXISTS "paidAt"       TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "paymentMode"  TEXT;
