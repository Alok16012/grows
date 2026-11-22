-- Call Dialer: sales prospects, every call made or received on a paired phone,
-- click-to-call requests from the ERP to the phone, and the paired phones. Idempotent.
CREATE TABLE IF NOT EXISTS "SalesLead" (
  "id"            TEXT PRIMARY KEY,
  "leadNo"        TEXT NOT NULL UNIQUE,
  "company"       TEXT,
  "contactName"   TEXT NOT NULL,
  "designation"   TEXT,
  "phone"         TEXT NOT NULL,
  "phoneKey"      TEXT NOT NULL,
  "altPhone"      TEXT,
  "email"         TEXT,
  "city"          TEXT,
  "industry"      TEXT,
  "service"       TEXT,
  "source"        TEXT,
  "stage"         TEXT NOT NULL DEFAULT 'NEW',
  "expectedValue" DOUBLE PRECISION,
  "assignedTo"    TEXT,
  "nextFollowUp"  TIMESTAMP(3),
  "lastCalledAt"  TIMESTAMP(3),
  "lastOutcome"   TEXT,
  "callCount"     INTEGER NOT NULL DEFAULT 0,
  "notes"         TEXT,
  "lostReason"    TEXT,
  "wonAt"         TIMESTAMP(3),
  "createdBy"     TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SalesLead_phoneKey_idx" ON "SalesLead" ("phoneKey");
CREATE INDEX IF NOT EXISTS "SalesLead_assigned_idx" ON "SalesLead" ("assignedTo", "stage");
CREATE INDEX IF NOT EXISTS "SalesLead_followUp_idx" ON "SalesLead" ("nextFollowUp");

CREATE TABLE IF NOT EXISTS "DialerDevice" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "tokenHash"   TEXT NOT NULL UNIQUE,
  "deviceName"  TEXT,
  "simNumber"   TEXT,
  "appVersion"  TEXT,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt"  TIMESTAMP(3),
  "lastSyncAt"  TIMESTAMP(3),
  "onCall"      BOOLEAN NOT NULL DEFAULT false,
  "onCallSince" TIMESTAMP(3),
  "callPhone"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DialerDevice_user_idx" ON "DialerDevice" ("userId", "active");

CREATE TABLE IF NOT EXISTS "DialRequest" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "phone"      TEXT NOT NULL,
  "targetType" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "targetId"   TEXT,
  "targetName" TEXT,
  "status"     TEXT NOT NULL DEFAULT 'PENDING',
  "deviceId"   TEXT,
  "pickedAt"   TIMESTAMP(3),
  "callLogId"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DialRequest_user_idx" ON "DialRequest" ("userId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "CallLog" (
  "id"            TEXT PRIMARY KEY,
  "userId"        TEXT NOT NULL,
  "deviceId"      TEXT,
  "callKey"       TEXT NOT NULL UNIQUE,
  "phone"         TEXT NOT NULL,
  "phoneKey"      TEXT NOT NULL,
  "direction"     TEXT NOT NULL,
  "connected"     BOOLEAN NOT NULL DEFAULT false,
  "startedAt"     TIMESTAMP(3) NOT NULL,
  "durationSec"   INTEGER NOT NULL DEFAULT 0,
  "targetType"    TEXT NOT NULL DEFAULT 'UNKNOWN',
  "targetId"      TEXT,
  "targetName"    TEXT,
  "dialRequestId" TEXT,
  "outcome"       TEXT,
  "notes"         TEXT,
  "followUpAt"    TIMESTAMP(3),
  "source"        TEXT NOT NULL DEFAULT 'CALL_LOG',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CallLog_user_idx" ON "CallLog" ("userId", "startedAt");
CREATE INDEX IF NOT EXISTS "CallLog_started_idx" ON "CallLog" ("startedAt");
CREATE INDEX IF NOT EXISTS "CallLog_target_idx" ON "CallLog" ("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "CallLog_phoneKey_idx" ON "CallLog" ("phoneKey");
