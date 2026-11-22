-- Company profile: the company's own documents (registrations, licences, contracts …). Idempotent.
CREATE TABLE IF NOT EXISTS "CompanyDocument" (
  "id"          TEXT PRIMARY KEY,
  "category"    TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "docNumber"   TEXT,
  "issuedOn"    TIMESTAMP(3),
  "expiresOn"   TIMESTAMP(3),
  "fileUrl"     TEXT NOT NULL,
  "fileName"    TEXT NOT NULL,
  "notes"       TEXT,
  "visibility"  TEXT NOT NULL DEFAULT 'STAFF',
  "version"     INTEGER NOT NULL DEFAULT 1,
  "replacesId"  TEXT,
  "isArchived"  BOOLEAN NOT NULL DEFAULT false,
  "uploadedBy"  TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CompanyDocument_category_idx" ON "CompanyDocument" ("category");
CREATE INDEX IF NOT EXISTS "CompanyDocument_expiresOn_idx" ON "CompanyDocument" ("expiresOn");
