-- Communication Center tables. Idempotent — safe to run again.
CREATE TABLE IF NOT EXISTS "CommMessage" (
  "id"            TEXT PRIMARY KEY,
  "channel"       TEXT NOT NULL,
  "event"         TEXT NOT NULL,
  "recipientType" TEXT NOT NULL,
  "recipientId"   TEXT,
  "recipientName" TEXT,
  "toAddress"     TEXT NOT NULL,
  "subject"       TEXT,
  "template"      TEXT,
  "data"          JSONB,
  "refType"       TEXT,
  "refId"         TEXT,
  "status"        TEXT NOT NULL DEFAULT 'queued',
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "providerId"    TEXT,
  "error"         TEXT,
  "createdBy"     TEXT,
  "sentAt"        TIMESTAMP(3),
  "deliveredAt"   TIMESTAMP(3),
  "readAt"        TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommMessage_providerId_key" ON "CommMessage"("providerId");
CREATE INDEX IF NOT EXISTS "CommMessage_status_nextAttemptAt_idx" ON "CommMessage"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "CommMessage_event_idx" ON "CommMessage"("event");
CREATE INDEX IF NOT EXISTS "CommMessage_channel_idx" ON "CommMessage"("channel");
CREATE INDEX IF NOT EXISTS "CommMessage_recipientType_recipientId_idx" ON "CommMessage"("recipientType", "recipientId");
CREATE INDEX IF NOT EXISTS "CommMessage_refType_refId_idx" ON "CommMessage"("refType", "refId");
CREATE INDEX IF NOT EXISTS "CommMessage_createdAt_idx" ON "CommMessage"("createdAt");

CREATE TABLE IF NOT EXISTS "CommOptOut" (
  "id"        TEXT PRIMARY KEY,
  "channel"   TEXT NOT NULL,
  "address"   TEXT NOT NULL,
  "reason"    TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommOptOut_channel_address_key" ON "CommOptOut"("channel", "address");
