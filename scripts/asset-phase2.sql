-- Assets Phases 2-4: sizes & kits, recovery & exit clearance, register & verification.
-- Additive and safe to re-run.

-- Asset details: sizes group, recovery cost, warranty, site (own table; AssetMeta belongs to another role).
CREATE TABLE IF NOT EXISTS "AssetDetail" (
  "assetId"       TEXT PRIMARY KEY,
  "groupName"     TEXT,
  "recoveryCost"  DOUBLE PRECISION,
  "warrantyUntil" TIMESTAMP(3),
  "siteId"        TEXT,
  "siteName"      TEXT,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssetDetail_groupName_idx" ON "AssetDetail" ("groupName");

-- Employee sizes per item group (T-shirt: L, Safety shoes: 8 ...).
CREATE TABLE IF NOT EXISTS "EmployeeSize" (
  "id"         TEXT PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "groupName"  TEXT NOT NULL,
  "size"       TEXT NOT NULL,
  "updatedBy"  TEXT,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeSize_employee_group_key" ON "EmployeeSize" ("employeeId", "groupName");

-- Uniform / PPE kits.
CREATE TABLE IF NOT EXISTS "AssetKit" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "siteId"      TEXT,
  "siteName"    TEXT,
  "designation" TEXT,
  "items"       JSONB NOT NULL DEFAULT '[]',
  "onJoining"   BOOLEAN NOT NULL DEFAULT false,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Charges to employees for lost / damaged / not-returned items.
CREATE TABLE IF NOT EXISTS "AssetRecovery" (
  "id"           TEXT PRIMARY KEY,
  "recoveryNo"   TEXT NOT NULL UNIQUE,
  "employeeId"   TEXT NOT NULL,
  "issueId"      TEXT,
  "assetId"      TEXT NOT NULL,
  "quantity"     INTEGER NOT NULL DEFAULT 1,
  "amount"       DOUBLE PRECISION NOT NULL,
  "reason"       TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "via"          TEXT,
  "payrollMonth" INTEGER,
  "payrollYear"  INTEGER,
  "note"         TEXT,
  "createdBy"    TEXT,
  "decidedBy"    TEXT,
  "decidedAt"    TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AssetRecovery_employeeId_idx" ON "AssetRecovery" ("employeeId");
CREATE INDEX IF NOT EXISTS "AssetRecovery_status_idx" ON "AssetRecovery" ("status");
CREATE INDEX IF NOT EXISTS "AssetRecovery_payroll_idx" ON "AssetRecovery" ("payrollYear", "payrollMonth");

ALTER TABLE "Payroll" ADD COLUMN IF NOT EXISTS "assetRecovery" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Physical verification.
CREATE TABLE IF NOT EXISTS "AssetVerification" (
  "id"             TEXT PRIMARY KEY,
  "verificationNo" TEXT NOT NULL UNIQUE,
  "name"           TEXT NOT NULL,
  "siteId"         TEXT,
  "siteName"       TEXT,
  "status"         TEXT NOT NULL DEFAULT 'OPEN',
  "note"           TEXT,
  "startedBy"      TEXT,
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedBy"       TEXT,
  "closedAt"       TIMESTAMP(3)
);
CREATE TABLE IF NOT EXISTS "AssetVerificationLine" (
  "id"             TEXT PRIMARY KEY,
  "verificationId" TEXT NOT NULL,
  "assetId"        TEXT NOT NULL,
  "expectedQty"    INTEGER NOT NULL DEFAULT 0,
  "countedQty"     INTEGER,
  "condition"      TEXT,
  "note"           TEXT,
  "countedBy"      TEXT,
  "countedAt"      TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "AssetVerificationLine_verificationId_idx" ON "AssetVerificationLine" ("verificationId");
