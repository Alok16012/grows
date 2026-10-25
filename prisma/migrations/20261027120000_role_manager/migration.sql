-- Role & User Manager (spec 25 Oct 2026): data scope per role, sign-in
-- bookkeeping per user, and an append-only audit log of access changes.
--
-- Everything lives in NEW tables (links to existing data are foreign keys to
-- "CustomRole" and "User"), so deploying the code before this SQL runs breaks
-- nothing: roles behave as scope ALL, sessions skip the version check, and the
-- audit log page answers 503 until these tables exist.
--
-- Production migrations are applied by hand, so every statement is idempotent
-- and safe to paste into the Supabase SQL editor and re-run.
-- Same SQL lives in prisma/migrations/20261027120000_role_manager.

CREATE TABLE IF NOT EXISTS "RoleMeta" (
    "roleId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'SELF',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoleMeta_pkey" PRIMARY KEY ("roleId"),
    CONSTRAINT "RoleMeta_scope_check" CHECK ("scope" IN ('ALL', 'ASSIGNED_SITES', 'MY_TEAM', 'SELF'))
);

DO $$ BEGIN
    ALTER TABLE "RoleMeta" ADD CONSTRAINT "RoleMeta_roleId_fkey"
        FOREIGN KEY ("roleId") REFERENCES "CustomRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "UserAccess" (
    "userId" TEXT NOT NULL,
    "loginMethod" TEXT NOT NULL DEFAULT 'OTP',
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "permissionsVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAccess_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "UserAccess_loginMethod_check" CHECK ("loginMethod" IN ('OTP', 'PASSWORD'))
);

DO $$ BEGIN
    ALTER TABLE "UserAccess" ADD CONSTRAINT "UserAccess_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetName" TEXT,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "batchId" TEXT,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_at_idx" ON "AuditLog"("at");
CREATE INDEX IF NOT EXISTS "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_at_idx" ON "AuditLog"("actorId", "at");
CREATE INDEX IF NOT EXISTS "AuditLog_action_at_idx" ON "AuditLog"("action", "at");

-- Audit rows cannot be edited or deleted through the app (or anyone else
-- without first dropping this trigger).
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'AuditLog rows are append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AuditLog_append_only" ON "AuditLog";
CREATE TRIGGER "AuditLog_append_only" BEFORE UPDATE OR DELETE ON "AuditLog"
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- The app connects as "postgres". When this script is run by another role (e.g.
-- grows_local via DIRECT_URL) that role owns the tables, so grant the app full
-- access — otherwise it can read but every write fails with "permission denied".
GRANT ALL ON TABLE "RoleMeta", "UserAccess", "AuditLog" TO postgres;
GRANT EXECUTE ON FUNCTION audit_log_append_only() TO postgres;
