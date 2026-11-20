-- Customer contacts per site (Communication Center). Idempotent.
CREATE TABLE IF NOT EXISTS "CustomerContact" (
  "id"             TEXT PRIMARY KEY,
  "siteId"         TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "designation"    TEXT,
  "phone"          TEXT,
  "email"          TEXT,
  "projectIds"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "receiveReports" BOOLEAN NOT NULL DEFAULT true,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdBy"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CustomerContact_siteId_idx" ON "CustomerContact"("siteId");
