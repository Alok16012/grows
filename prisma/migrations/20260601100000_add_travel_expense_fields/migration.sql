ALTER TABLE "Expense"
    ADD COLUMN IF NOT EXISTS "travelDays"      INTEGER,
    ADD COLUMN IF NOT EXISTS "travelDailyRate" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "AppSetting" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
