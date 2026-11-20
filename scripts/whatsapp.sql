-- WhatsApp message log (Meta Cloud API). Idempotent — safe to run again.
CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
  "id"            TEXT PRIMARY KEY,
  "toPhone"       TEXT NOT NULL,
  "recipientName" TEXT,
  "employeeId"    TEXT,
  "event"         TEXT NOT NULL,
  "template"      TEXT NOT NULL,
  "language"      TEXT NOT NULL,
  "refType"       TEXT,
  "refId"         TEXT,
  "status"        TEXT NOT NULL DEFAULT 'queued',
  "wamid"         TEXT,
  "error"         TEXT,
  "payload"       JSONB,
  "sentBy"        TEXT,
  "sentAt"        TIMESTAMP(3),
  "deliveredAt"   TIMESTAMP(3),
  "readAt"        TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessage_wamid_key" ON "WhatsAppMessage"("wamid");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_status_idx" ON "WhatsAppMessage"("status");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_event_idx" ON "WhatsAppMessage"("event");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_refType_refId_idx" ON "WhatsAppMessage"("refType", "refId");
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_createdAt_idx" ON "WhatsAppMessage"("createdAt");
