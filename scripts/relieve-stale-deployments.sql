-- One-time cleanup: relieve site deployments still marked active for employees
-- who have left (RESIGNED / TERMINATED). They were left behind by status edits
-- made before the edit / exit flows started relieving postings automatically.
-- The end date is the employee's leaving date when known, otherwise today.
--
-- Run the SELECT first to see what will change, then the UPDATE.

-- Preview
SELECT e."employeeId", e."firstName", e."lastName", e.status, e."dateOfLeaving", s.name AS site
FROM "Deployment" d
JOIN "Employee" e ON e.id = d."employeeId"
LEFT JOIN "Site" s ON s.id = d."siteId"
WHERE d."isActive" = true
  AND e.status IN ('RESIGNED', 'TERMINATED')
ORDER BY s.name, e."employeeId";

-- Cleanup
UPDATE "Deployment" d
SET "isActive"   = false,
    "endDate"    = COALESCE(e."dateOfLeaving", now()),
    "relievedAt" = now()
FROM "Employee" e
WHERE e.id = d."employeeId"
  AND d."isActive" = true
  AND e.status IN ('RESIGNED', 'TERMINATED');
