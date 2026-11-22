-- Join link manager (Onboarding → Join links). Idempotent.
CREATE TABLE IF NOT EXISTS "JoinLink" (
  "id"             TEXT PRIMARY KEY,
  "code"           TEXT NOT NULL UNIQUE,
  "name"           TEXT NOT NULL,
  "recruiterId"    TEXT NOT NULL,
  "siteId"         TEXT,
  "designation"    TEXT,
  "employmentType" TEXT,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "expiresAt"      TIMESTAMP(3),
  "maxUses"        INTEGER,
  "opens"          INTEGER NOT NULL DEFAULT 0,
  "starts"         INTEGER NOT NULL DEFAULT 0,
  "submits"        INTEGER NOT NULL DEFAULT 0,
  "blocked"        INTEGER NOT NULL DEFAULT 0,
  "createdBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "JoinLink_recruiterId_idx" ON "JoinLink" ("recruiterId");
