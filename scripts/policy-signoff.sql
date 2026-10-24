-- Policy sign-off: versioned policies mapped to designations, signed by
-- employees during joining (onboarding step 3) with evidence — scroll time,
-- typed name, optional drawn signature, IP, user agent — against an immutable
-- version and its SHA-256 content hash.
--
-- Everything lives in NEW tables (the only link to existing data is a foreign
-- key to "Employee"), so deploying the code before this SQL runs breaks
-- nothing: until these tables exist every /api/policies route answers 503 and
-- the onboarding policy step is skipped.
--
-- Production migrations are applied by hand, so every statement is idempotent
-- and safe to paste into the Supabase SQL editor and re-run.
-- Same SQL lives in scripts/policy-signoff.sql.

CREATE TABLE IF NOT EXISTS "SignoffPolicy" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "requiresSignature" BOOLEAN NOT NULL DEFAULT true,
    "appliesToAll" BOOLEAN NOT NULL DEFAULT false,
    "currentVersionId" TEXT,
    "draftContent" TEXT NOT NULL DEFAULT '',
    "draftAttachmentUrl" TEXT,
    "draftEffectiveFrom" TIMESTAMP(3),
    "draftChangeNote" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignoffPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SignoffPolicyVersion" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "changeNote" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "requireResign" BOOLEAN NOT NULL DEFAULT false,
    "publishedBy" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignoffPolicyVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SignoffPolicyDesignation" (
    "policyId" TEXT NOT NULL,
    "designationKey" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignoffPolicyDesignation_pkey" PRIMARY KEY ("policyId","designationKey")
);

CREATE TABLE IF NOT EXISTS "SignoffAck" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "scrolledAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signatureType" TEXT,
    "typedName" TEXT,
    "signatureImage" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "channel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignoffAck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SignoffAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignoffAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SignoffPolicy_status_idx" ON "SignoffPolicy"("status");

CREATE INDEX IF NOT EXISTS "SignoffPolicyVersion_policyId_idx" ON "SignoffPolicyVersion"("policyId");

CREATE UNIQUE INDEX IF NOT EXISTS "SignoffPolicyVersion_policyId_versionNo_key" ON "SignoffPolicyVersion"("policyId", "versionNo");

CREATE INDEX IF NOT EXISTS "SignoffPolicyDesignation_designationKey_idx" ON "SignoffPolicyDesignation"("designationKey");

CREATE INDEX IF NOT EXISTS "SignoffAck_versionId_idx" ON "SignoffAck"("versionId");

CREATE UNIQUE INDEX IF NOT EXISTS "SignoffAck_employeeId_versionId_key" ON "SignoffAck"("employeeId", "versionId");

CREATE INDEX IF NOT EXISTS "SignoffAudit_entity_entityId_idx" ON "SignoffAudit"("entity", "entityId");

DO $$ BEGIN
    ALTER TABLE "SignoffPolicyVersion" ADD CONSTRAINT "SignoffPolicyVersion_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SignoffPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "SignoffPolicyDesignation" ADD CONSTRAINT "SignoffPolicyDesignation_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "SignoffPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "SignoffAck" ADD CONSTRAINT "SignoffAck_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "SignoffAck" ADD CONSTRAINT "SignoffAck_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SignoffPolicyVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A signature is only valid after the reader reached the end of the policy.
DO $$ BEGIN
    ALTER TABLE "SignoffAck" ADD CONSTRAINT "SignoffAck_signed_after_scroll"
        CHECK ("signedAt" IS NULL OR "scrolledAt" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Evidence is append-only: a published version never changes, a signature
-- never changes once given, and the audit trail is never edited or removed.
-- (Deleting a signature row is still possible so that removing an employee
-- record entirely keeps working.)
CREATE OR REPLACE FUNCTION signoff_block_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION signoff_block_signed_ack_update() RETURNS trigger AS $$
BEGIN
    IF OLD."signedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'A signed policy acknowledgement cannot be changed';
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SignoffPolicyVersion_no_update" ON "SignoffPolicyVersion";
CREATE TRIGGER "SignoffPolicyVersion_no_update" BEFORE UPDATE ON "SignoffPolicyVersion"
    FOR EACH ROW EXECUTE FUNCTION signoff_block_change();

DROP TRIGGER IF EXISTS "SignoffAck_no_update_when_signed" ON "SignoffAck";
CREATE TRIGGER "SignoffAck_no_update_when_signed" BEFORE UPDATE ON "SignoffAck"
    FOR EACH ROW EXECUTE FUNCTION signoff_block_signed_ack_update();

DROP TRIGGER IF EXISTS "SignoffAudit_append_only" ON "SignoffAudit";
CREATE TRIGGER "SignoffAudit_append_only" BEFORE UPDATE OR DELETE ON "SignoffAudit"
    FOR EACH ROW EXECUTE FUNCTION signoff_block_change();
