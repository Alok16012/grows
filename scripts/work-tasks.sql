-- Tasks module: tasks assigned to people, and their comments. Idempotent.
CREATE TABLE IF NOT EXISTS "WorkTask" (
  "id"             TEXT PRIMARY KEY,
  "taskNo"         TEXT NOT NULL UNIQUE,
  "groupId"        TEXT,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "priority"       TEXT NOT NULL DEFAULT 'MEDIUM',
  "status"         TEXT NOT NULL DEFAULT 'TODO',
  "dueAt"          TIMESTAMP(3),
  "assigneeId"     TEXT NOT NULL,
  "createdBy"      TEXT NOT NULL,
  "siteId"         TEXT,
  "needsApproval"  BOOLEAN NOT NULL DEFAULT false,
  "attachments"    JSONB,
  "startedAt"      TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "completionNote" TEXT,
  "approvedAt"     TIMESTAMP(3),
  "approvedBy"     TEXT,
  "returnedNote"   TEXT,
  "lastRemindedAt" TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WorkTask_assignee_idx" ON "WorkTask" ("assigneeId", "status");
CREATE INDEX IF NOT EXISTS "WorkTask_createdBy_idx" ON "WorkTask" ("createdBy");
CREATE INDEX IF NOT EXISTS "WorkTask_dueAt_idx" ON "WorkTask" ("dueAt");
CREATE TABLE IF NOT EXISTS "WorkTaskComment" (
  "id"          TEXT PRIMARY KEY,
  "taskId"      TEXT NOT NULL REFERENCES "WorkTask"("id") ON DELETE CASCADE,
  "userId"      TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "attachments" JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "WorkTaskComment_task_idx" ON "WorkTaskComment" ("taskId");
