-- Add new expense categories per Growus spec (Hotel, Material, Mobile Recharge)
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'HOTEL';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'MATERIAL';
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'MOBILE_RECHARGE';
