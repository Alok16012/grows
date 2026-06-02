-- Recreate ExpenseCategory enum with all 26 new categories.
-- PostgreSQL does not allow ADD VALUE inside a transaction block, so we
-- create a new enum, migrate the column, and rename.  This IS transactional.

CREATE TYPE "ExpenseCategory_new" AS ENUM (
  -- Travel
  'TRAVEL', 'TRANSPORTATION', 'FUEL', 'ACCOMMODATION',
  -- Daily Ops
  'FOOD', 'HOTEL', 'MATERIAL', 'OFFICE_SUPPLIES', 'OFFICE_CONSUMABLES',
  'STATIONERY_PRINTING', 'HOUSEKEEPING_CLEANING', 'UTILITY_ELECTRICAL', 'REPAIR_MAINTENANCE',
  -- People & HR
  'SALARY_WAGES', 'EMPLOYEE_ADVANCE', 'RECRUITMENT_EXPENSE', 'CANDIDATE_EXPENSE',
  'HR_OPERATIONS', 'SAFETY_PPE',
  -- Business / Client
  'CLIENT_PROJECT', 'LABOUR', 'INSPECTION_QUALITY', 'COMPLIANCE_AUDIT', 'CELEBRATION',
  -- Tech & Admin
  'IT_ACCESSORIES', 'COURIER', 'DOCUMENTATION_LEGAL', 'MOBILE_RECHARGE',
  -- Legacy / Catch-all
  'COMMUNICATION', 'MEDICAL', 'UNIFORM', 'TRAINING', 'MISCELLANEOUS', 'OTHER'
);

ALTER TABLE "Expense"
  ALTER COLUMN "category" TYPE "ExpenseCategory_new"
  USING "category"::text::"ExpenseCategory_new";

DROP TYPE "ExpenseCategory";

ALTER TYPE "ExpenseCategory_new" RENAME TO "ExpenseCategory";
