-- =====================================================================
-- Reassign OLD external-onboarding leads to their recruiter
-- (run once in Supabase -> SQL Editor)
-- =====================================================================
-- Leads created by the /join onboarding flow before the fix were owned
-- by an admin with no assignee, so they never showed in the recruiter's
-- Recruitment pipeline. The recruiter is recoverable via:
--     Lead.convertedEmployeeId -> Employee.managerId  (the recruiter's user id)
--
-- This sets assignedTo + createdBy to that recruiter. FK-safe: only rows
-- whose managerId is a real User are touched.
-- =====================================================================

-- 1) PREVIEW — how many leads will change, and to whom (run this first).
SELECT l.id, l."candidateName", l."assignedTo" AS current_owner,
       e."managerId" AS new_recruiter, u.name AS recruiter_name
FROM "Lead" l
JOIN "Employee" e ON e.id = l."convertedEmployeeId"
JOIN "User" u     ON u.id = e."managerId"
WHERE l.source = 'External Onboarding'
  AND e."managerId" IS NOT NULL
  AND l."assignedTo" IS DISTINCT FROM e."managerId";

-- 2) APPLY — reassign to the recruiter.
UPDATE "Lead" l
SET "assignedTo" = e."managerId",
    "createdBy"  = e."managerId"
FROM "Employee" e
WHERE l."convertedEmployeeId" = e.id
  AND l.source = 'External Onboarding'
  AND e."managerId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = e."managerId")
  AND l."assignedTo" IS DISTINCT FROM e."managerId";
