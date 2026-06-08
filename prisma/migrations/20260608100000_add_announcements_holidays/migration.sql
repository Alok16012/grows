-- Employee self-service: company announcements + holiday calendar.
-- Guarded (IF NOT EXISTS) so re-runs / prod drift don't error.

CREATE TABLE IF NOT EXISTS "Announcement" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "body"        TEXT NOT NULL,
    "category"    TEXT NOT NULL DEFAULT 'NOTICE',
    "pinned"      BOOLEAN NOT NULL DEFAULT false,
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Announcement_isActive_idx" ON "Announcement"("isActive");
CREATE INDEX IF NOT EXISTS "Announcement_publishedAt_idx" ON "Announcement"("publishedAt");

CREATE TABLE IF NOT EXISTS "Holiday" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "date"        TIMESTAMP(3) NOT NULL,
    "type"        TEXT NOT NULL DEFAULT 'PUBLIC',
    "description" TEXT,
    "createdBy"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Holiday_date_idx" ON "Holiday"("date");
