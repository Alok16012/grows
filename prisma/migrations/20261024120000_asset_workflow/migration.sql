-- Employee asset workflow: request → approve → issue → acknowledge → return,
-- with a stock ledger, per-asset settings and an audit trail.
--
-- Everything lives in NEW tables (no new Asset / EmployeeAsset / Employee /
-- User columns) so deploying the code before this SQL runs cannot break the
-- existing asset screens: until these tables exist the new routes answer 503
-- and the old assign/return routes simply skip the ledger.
--
-- Production migrations are applied by hand (DIRECT_URL is unset on Vercel), so
-- every statement is idempotent and safe to paste into the Supabase SQL editor
-- and re-run. Same SQL lives in scripts/asset-workflow.sql.

CREATE TABLE IF NOT EXISTS "AssetRequest" (
    "id"               TEXT NOT NULL,
    "requestNo"        TEXT NOT NULL,
    "requestType"      TEXT NOT NULL,
    "reason"           TEXT NOT NULL,
    "remarks"          TEXT,
    "attachmentUrl"    TEXT,
    "requestedBy"      TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'SUBMITTED',
    "fulfilmentStatus" TEXT NOT NULL DEFAULT 'NOT_ISSUED',
    "decidedBy"        TEXT,
    "decidedAt"        TIMESTAMP(3),
    "decisionNote"     TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssetRequestItem" (
    "id"           TEXT NOT NULL,
    "requestId"    TEXT NOT NULL,
    "employeeId"   TEXT NOT NULL,
    "assetId"      TEXT NOT NULL,
    "size"         TEXT,
    "requestedQty" INTEGER NOT NULL,
    "approvedQty"  INTEGER,
    "issuedQty"    INTEGER NOT NULL DEFAULT 0,
    "remarks"      TEXT,
    CONSTRAINT "AssetRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssetIssue" (
    "id"              TEXT NOT NULL,
    "issueNo"         TEXT NOT NULL,
    "requestItemId"   TEXT,
    "employeeAssetId" TEXT,
    "employeeId"      TEXT NOT NULL,
    "assetId"         TEXT NOT NULL,
    "quantity"        INTEGER NOT NULL,
    "size"            TEXT,
    "serialNo"        TEXT,
    "issuedBy"        TEXT NOT NULL,
    "issuedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt"  TIMESTAMP(3),
    "acknowledgedBy"  TEXT,
    "idempotencyKey"  TEXT,
    "remarks"         TEXT,
    "attachmentUrl"   TEXT,
    "status"          TEXT NOT NULL DEFAULT 'ACTIVE',
    "returnedQty"     INTEGER NOT NULL DEFAULT 0,
    "replacesIssueId" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssetStockTxn" (
    "id"           TEXT NOT NULL,
    "assetId"      TEXT NOT NULL,
    "type"         TEXT NOT NULL,
    "qty"          INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "refType"      TEXT,
    "refId"        TEXT,
    "userId"       TEXT,
    "note"         TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetStockTxn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssetMeta" (
    "assetId"      TEXT NOT NULL,
    "size"         TEXT,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "trackSerial"  BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetMeta_pkey" PRIMARY KEY ("assetId")
);

CREATE TABLE IF NOT EXISTS "AssetAuditLog" (
    "id"        TEXT NOT NULL,
    "entity"    TEXT NOT NULL,
    "entityId"  TEXT NOT NULL,
    "action"    TEXT NOT NULL,
    "userId"    TEXT,
    "reason"    TEXT,
    "before"    JSONB,
    "after"     JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AssetRequest_requestNo_key" ON "AssetRequest"("requestNo");
CREATE INDEX IF NOT EXISTS "AssetRequest_status_idx" ON "AssetRequest"("status");
CREATE INDEX IF NOT EXISTS "AssetRequest_requestedBy_idx" ON "AssetRequest"("requestedBy");
CREATE INDEX IF NOT EXISTS "AssetRequest_createdAt_idx" ON "AssetRequest"("createdAt");

CREATE INDEX IF NOT EXISTS "AssetRequestItem_requestId_idx" ON "AssetRequestItem"("requestId");
CREATE INDEX IF NOT EXISTS "AssetRequestItem_employeeId_idx" ON "AssetRequestItem"("employeeId");
CREATE INDEX IF NOT EXISTS "AssetRequestItem_assetId_idx" ON "AssetRequestItem"("assetId");

CREATE UNIQUE INDEX IF NOT EXISTS "AssetIssue_issueNo_key" ON "AssetIssue"("issueNo");
CREATE UNIQUE INDEX IF NOT EXISTS "AssetIssue_employeeAssetId_key" ON "AssetIssue"("employeeAssetId");
CREATE UNIQUE INDEX IF NOT EXISTS "AssetIssue_idempotencyKey_key" ON "AssetIssue"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "AssetIssue_employeeId_idx" ON "AssetIssue"("employeeId");
CREATE INDEX IF NOT EXISTS "AssetIssue_assetId_idx" ON "AssetIssue"("assetId");
CREATE INDEX IF NOT EXISTS "AssetIssue_requestItemId_idx" ON "AssetIssue"("requestItemId");
CREATE INDEX IF NOT EXISTS "AssetIssue_status_idx" ON "AssetIssue"("status");

CREATE INDEX IF NOT EXISTS "AssetStockTxn_assetId_idx" ON "AssetStockTxn"("assetId");
CREATE INDEX IF NOT EXISTS "AssetStockTxn_createdAt_idx" ON "AssetStockTxn"("createdAt");

CREATE INDEX IF NOT EXISTS "AssetAuditLog_entity_entityId_idx" ON "AssetAuditLog"("entity", "entityId");

DO $$ BEGIN
    ALTER TABLE "AssetRequestItem" ADD CONSTRAINT "AssetRequestItem_requestId_fkey"
        FOREIGN KEY ("requestId") REFERENCES "AssetRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssetRequestItem" ADD CONSTRAINT "AssetRequestItem_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RESTRICT: an asset with request/issue history is deactivated, never deleted.
DO $$ BEGIN
    ALTER TABLE "AssetRequestItem" ADD CONSTRAINT "AssetRequestItem_assetId_fkey"
        FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_requestItemId_fkey"
        FOREIGN KEY ("requestItemId") REFERENCES "AssetRequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_employeeAssetId_fkey"
        FOREIGN KEY ("employeeAssetId") REFERENCES "EmployeeAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_employeeId_fkey"
        FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssetIssue" ADD CONSTRAINT "AssetIssue_assetId_fkey"
        FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssetStockTxn" ADD CONSTRAINT "AssetStockTxn_assetId_fkey"
        FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "AssetMeta" ADD CONSTRAINT "AssetMeta_assetId_fkey"
        FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: open the ledger at today's shelf count, so every later balance
-- reconciles with Asset.available. Skips assets that already have a row, so a
-- re-run never doubles the opening balance.
INSERT INTO "AssetStockTxn" ("id", "assetId", "type", "qty", "balanceAfter", "refType", "note", "createdAt")
SELECT gen_random_uuid()::text, a."id", 'OPENING', a."available", a."available", 'MIGRATION',
       'Opening balance when the asset workflow was installed',
       -- Prisma stores UTC in TIMESTAMP(3); don't depend on the session timezone.
       (NOW() AT TIME ZONE 'UTC')
FROM "Asset" a
WHERE NOT EXISTS (SELECT 1 FROM "AssetStockTxn" t WHERE t."assetId" = a."id");

-- The app connects as "postgres". When this script is run by another role (e.g.
-- grows_local via DIRECT_URL) that role owns the tables, so grant the app full
-- access — otherwise it can read but every write fails with "permission denied".
GRANT ALL ON TABLE "AssetAuditLog", "AssetIssue", "AssetMeta", "AssetRequest", "AssetRequestItem", "AssetStockTxn" TO postgres;
