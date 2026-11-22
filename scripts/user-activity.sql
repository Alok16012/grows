-- Access centre: last seen per login, and "sign out everywhere". Idempotent.
CREATE TABLE IF NOT EXISTS "UserActivity" (
  "userId"      TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "lastSeenAt"  TIMESTAMP(3),
  "lastSeenVia" TEXT,
  "signedOutAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "UserActivity_lastSeenAt_idx" ON "UserActivity" ("lastSeenAt");
