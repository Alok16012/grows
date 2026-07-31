-- Indexes backing the hottest list queries.
--
-- Employee: the list filters by departmentId and always sorts createdAt desc
-- within a status filter, but only branchId/status were indexed.
-- Lead: the recruitment ownership filter ORs on createdBy and formSlug, neither
-- of which was indexed, so every recruitment load scanned the table.
--
-- Plain CREATE INDEX so this stays runnable inside `prisma migrate deploy`'s
-- transaction. It holds a lock that blocks writes (not reads) for the duration
-- of the build. On a large table, run the CONCURRENTLY variant by hand instead —
-- outside a transaction, one statement at a time.

CREATE INDEX IF NOT EXISTS "Employee_departmentId_idx"
    ON "Employee" ("departmentId");

CREATE INDEX IF NOT EXISTS "Employee_status_createdAt_idx"
    ON "Employee" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "Lead_createdBy_idx"
    ON "Lead" ("createdBy");

CREATE INDEX IF NOT EXISTS "Lead_formSlug_idx"
    ON "Lead" ("formSlug");

-- Backs the DISTINCT ON (employeeId) ORDER BY checkedInAt DESC lookup that
-- resolves each employee's latest field check-in.
CREATE INDEX IF NOT EXISTS "FieldCheckIn_employeeId_checkedInAt_idx"
    ON "FieldCheckIn" ("employeeId", "checkedInAt");
