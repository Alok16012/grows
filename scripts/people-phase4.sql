-- People Phase 4: change approval (maker-checker) and dated movements.
-- Additive and safe to re-run.
CREATE TABLE IF NOT EXISTS "EmployeeChangeRequest" (
  "id"            TEXT PRIMARY KEY,
  "requestNo"     TEXT NOT NULL UNIQUE,
  "employeeId"    TEXT NOT NULL,
  "requestedBy"   TEXT NOT NULL,
  "source"        TEXT NOT NULL DEFAULT 'HR',
  "changes"       JSONB NOT NULL DEFAULT '[]',
  "reason"        TEXT,
  "attachmentUrl" TEXT,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "decidedBy"     TEXT,
  "decidedAt"     TIMESTAMP(3),
  "decisionNote"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmployeeChangeRequest_employeeId_idx" ON "EmployeeChangeRequest" ("employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeChangeRequest_status_idx" ON "EmployeeChangeRequest" ("status");

CREATE TABLE IF NOT EXISTS "EmployeeMovement" (
  "id"            TEXT PRIMARY KEY,
  "employeeId"    TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "fromValues"    JSONB,
  "toValues"      JSONB NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'SCHEDULED',
  "note"          TEXT,
  "createdBy"     TEXT,
  "appliedAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmployeeMovement_employeeId_idx" ON "EmployeeMovement" ("employeeId");
CREATE INDEX IF NOT EXISTS "EmployeeMovement_due_idx" ON "EmployeeMovement" ("status", "effectiveDate");
