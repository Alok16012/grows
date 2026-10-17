-- OTP + MPIN login and failed-attempt lockout.
--
-- Kept in their own tables (not new User columns) so that deploying the code
-- before this SQL runs cannot break User queries: until these tables exist the
-- app simply keeps the old password-only login.
--
-- Production migrations are applied by hand (DIRECT_URL is unset on Vercel), so
-- every statement is idempotent and safe to paste into the Supabase SQL editor
-- and re-run. Same SQL lives in scripts/login-otp-mpin.sql.

CREATE TABLE IF NOT EXISTS "UserCredential" (
    "userId"      TEXT NOT NULL,
    "mpinHash"    TEXT,
    "mpinSetAt"   TIMESTAMP(3),
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserCredential_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "LoginOtp" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "codeHash"   TEXT NOT NULL,
    "purpose"    TEXT NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LoginOtp_userId_createdAt_idx" ON "LoginOtp"("userId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "UserCredential" ADD CONSTRAINT "UserCredential_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "LoginOtp" ADD CONSTRAINT "LoginOtp_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
