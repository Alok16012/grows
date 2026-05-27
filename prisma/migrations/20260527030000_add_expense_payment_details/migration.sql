-- Add payment date + UTR/transaction reference to Expense
ALTER TABLE "Expense"
    ADD COLUMN IF NOT EXISTS "paymentDate"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "transactionId" TEXT;
