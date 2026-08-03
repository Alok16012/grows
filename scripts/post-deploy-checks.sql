-- Post-deploy diagnostics — Growus CIMS, August 2026
--
-- Run these in the Supabase SQL editor after deploying. Everything here is
-- READ-ONLY: nothing is modified. Each section says what to do if rows come back.
--
-- Related scripts:
--   scripts/find-roles-needing-permissions.sql   roles affected by the .view -> .manage change
--   scripts/normalize-identity-fields.sql        Aadhaar / PAN / IFSC formatting clean-up
--   prisma/migrations/20260801120000_add_perf_indexes/migration.sql   still to be applied


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Salary wiped to zero  ← RUN THIS FIRST
-- ═══════════════════════════════════════════════════════════════════════════
-- Anyone without the "View Salary & CTC" permission who edited an employee —
-- even just to change a phone number or a role — silently overwrote that
-- employee's salary structure with zeros. Fixed in bcac8f4, but records damaged
-- before the deploy stay damaged.
--
-- Rows here need their salary structure re-entered from your own records.

SELECT e."employeeId",
       e."firstName" || ' ' || COALESCE(e."lastName", '') AS name,
       e."designation",
       e."basicSalary"                                    AS employee_basic,
       s."basic"                                          AS structure_basic,
       s."da", s."hra", s."conveyance",
       s."updatedAt"                                      AS structure_last_changed
FROM "Employee" e
LEFT JOIN "EmployeeSalary" s ON s."employeeId" = e."id"
WHERE e."status" = 'ACTIVE'
  AND (
        -- structure exists but every component is zero
        (s."id" IS NOT NULL AND COALESCE(s."basic",0) = 0
                            AND COALESCE(s."da",0) = 0
                            AND COALESCE(s."hra",0) = 0
                            AND COALESCE(s."conveyance",0) = 0)
        -- or the employee record itself lost its basic salary
     OR COALESCE(e."basicSalary", 0) = 0
      )
ORDER BY s."updatedAt" DESC NULLS LAST;


-- Narrower version: structures zeroed recently. If the damage happened during a
-- known window, this tells you who to fix first. Adjust the interval.
SELECT e."employeeId",
       e."firstName" || ' ' || COALESCE(e."lastName", '') AS name,
       s."basic", s."ctcMonthly", s."updatedAt"
FROM "EmployeeSalary" s
JOIN "Employee" e ON e."id" = s."employeeId"
WHERE COALESCE(s."basic", 0) = 0
  AND s."updatedAt" > now() - interval '90 days'
ORDER BY s."updatedAt" DESC;


-- Cross-check against payroll: someone paid a real salary in a past month but
-- now holding a zero structure is almost certainly a victim rather than a
-- genuinely unpaid record.
SELECT e."employeeId",
       e."firstName" || ' ' || COALESCE(e."lastName", '') AS name,
       max(p."netSalary")                                 AS highest_net_paid,
       max(p."year" * 100 + p."month")                    AS last_payroll_yyyymm,
       COALESCE(s."basic", 0)                             AS structure_basic_now
FROM "Payroll" p
JOIN "Employee" e       ON e."id" = p."employeeId"
LEFT JOIN "EmployeeSalary" s ON s."employeeId" = e."id"
WHERE e."status" = 'ACTIVE'
GROUP BY e."employeeId", e."firstName", e."lastName", s."basic"
HAVING max(p."netSalary") > 0 AND COALESCE(s."basic", 0) = 0
ORDER BY highest_net_paid DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Records that will fail the new PF / ESIC rules
-- ═══════════════════════════════════════════════════════════════════════════
-- PF is now 12 digits and ESIC 10. These forms re-check every field on save, so
-- an employee holding an old-format value will show an error the next time
-- anyone edits them — even for an unrelated change. Correct these in advance so
-- HR isn't surprised.

SELECT "employeeId",
       "firstName" || ' ' || COALESCE("lastName", '') AS name,
       'PF number'                                    AS field,
       "pfNumber"                                     AS current_value,
       length(regexp_replace("pfNumber", '[^0-9]', '', 'g')) AS digits
FROM "Employee"
WHERE "pfNumber" IS NOT NULL AND "pfNumber" <> ''
  AND length(regexp_replace("pfNumber", '[^0-9]', '', 'g')) <> 12

UNION ALL

SELECT "employeeId",
       "firstName" || ' ' || COALESCE("lastName", ''),
       'ESIC number',
       "esiNumber",
       length(regexp_replace("esiNumber", '[^0-9]', '', 'g'))
FROM "Employee"
WHERE "esiNumber" IS NOT NULL AND "esiNumber" <> ''
  AND length(regexp_replace("esiNumber", '[^0-9]', '', 'g')) <> 10

UNION ALL

SELECT "employeeId",
       "firstName" || ' ' || COALESCE("lastName", ''),
       'UAN',
       "uan",
       length(regexp_replace("uan", '[^0-9]', '', 'g'))
FROM "Employee"
WHERE "uan" IS NOT NULL AND "uan" <> ''
  AND length(regexp_replace("uan", '[^0-9]', '', 'g')) <> 12

ORDER BY field, "employeeId";


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Quality Inspector — why they could create projects and assignments
-- ═══════════════════════════════════════════════════════════════════════════
-- The code holes are closed, but if the role itself carries these permissions
-- the person can still do it, and that is configuration rather than a bug.
-- Untick anything here you did not intend, in Admin -> Roles.

SELECT r."name"                                            AS role_name,
       r."isActive",
       (SELECT count(*) FROM "User" u
         WHERE u."customRoleId" = r."id" AND u."isActive")  AS users_on_role,
       ARRAY(SELECT p FROM unnest(r."permissions") AS p
              WHERE p IN ('projects.manage','assignments.manage',
                          'sites.manage','employees.delete','users.manage'))
                                                           AS write_permissions_held
FROM "CustomRole" r
WHERE r."permissions" && ARRAY['projects.manage','assignments.manage',
                               'sites.manage','employees.delete','users.manage']
ORDER BY users_on_role DESC;


-- Which roles can actually open the inspector workspace. After the fix the
-- sidebar link and the route both need one of these three permissions, and they
-- were never used before, so they are probably ticked nowhere.
-- Expect zero rows on a first run — that is the reason inspectors saw an
-- assignment with no way to fill it.
SELECT r."name" AS role_name,
       (SELECT count(*) FROM "User" u
         WHERE u."customRoleId" = r."id" AND u."isActive") AS users_on_role,
       r."permissions"
FROM "CustomRole" r
WHERE r."isActive"
  AND r."permissions" && ARRAY['inspection.view','inspection.submit','inspection.history'];


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Duplicate project assignments
-- ═══════════════════════════════════════════════════════════════════════════
-- An inspector picked in a project's team who ALSO had whole-site access got two
-- Assignment rows for the same project, so it appeared twice in their workspace.
-- Prevented going forward; existing duplicates are listed here.
--
-- To clear one, delete the assignment that has no inspection attached — never
-- the one carrying inspection data.

SELECT a."projectId",
       pr."name"                                          AS project,
       a."inspectionBoyId",
       u."name"                                           AS inspector,
       count(*)                                           AS assignment_rows,
       ARRAY_AGG(a."id" ORDER BY a."createdAt")           AS assignment_ids,
       ARRAY_AGG(COALESCE(i."id", 'no-inspection') ORDER BY a."createdAt") AS inspection_ids
FROM "Assignment" a
JOIN "Project" pr       ON pr."id" = a."projectId"
JOIN "User" u           ON u."id"  = a."inspectionBoyId"
LEFT JOIN "Inspection" i ON i."assignmentId" = a."id"
WHERE a."status" = 'active'
GROUP BY a."projectId", pr."name", a."inspectionBoyId", u."name"
HAVING count(*) > 1
ORDER BY assignment_rows DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Employees stuck On Leave
-- ═══════════════════════════════════════════════════════════════════════════
-- Approving a leave used to set ON_LEAVE permanently. The nightly job now clears
-- it, but only for people whose approved leave visibly just ended — anyone left
-- over from the old behaviour needs setting back to Active by hand.

SELECT e."employeeId",
       e."firstName" || ' ' || COALESCE(e."lastName", '') AS name,
       e."status",
       max(l."endDate")                                   AS last_approved_leave_ended
FROM "Employee" e
LEFT JOIN "Leave" l ON l."employeeId" = e."id" AND l."status" = 'APPROVED'
WHERE e."status" = 'ON_LEAVE'
GROUP BY e."employeeId", e."firstName", e."lastName", e."status"
HAVING max(l."endDate") IS NULL OR max(l."endDate") < current_date
ORDER BY last_approved_leave_ended NULLS FIRST;


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Leavers who were never offboarded
-- ═══════════════════════════════════════════════════════════════════════════
-- Completing an exit used to update only the exit record. Anyone whose exit was
-- completed before the fix is still Active, still deployed, and can still sign
-- in. Offboard these from the employee screen.

SELECT e."employeeId",
       e."firstName" || ' ' || COALESCE(e."lastName", '') AS name,
       e."status"                                         AS employee_status,
       x."exitType",
       x."lastWorkingDate",
       x."completedAt",
       u."isActive"                                       AS login_still_active,
       (SELECT count(*) FROM "Deployment" d
         WHERE d."employeeId" = e."id" AND d."isActive")   AS active_deployments
FROM "ExitRequest" x
JOIN "Employee" e ON e."id" = x."employeeId"
LEFT JOIN "User" u ON u."id" = e."userId"
WHERE x."status" = 'COMPLETED'
  AND (e."status" NOT IN ('TERMINATED','RESIGNED')
       OR u."isActive" = true
       OR EXISTS (SELECT 1 FROM "Deployment" d
                   WHERE d."employeeId" = e."id" AND d."isActive"))
ORDER BY x."completedAt" DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Onboardings that cannot be approved yet
-- ═══════════════════════════════════════════════════════════════════════════
-- Approval now requires Aadhaar, PAN, photo and bank proof on file. This lists
-- pending onboardings and what each is missing, so you can chase the documents
-- instead of discovering it at the approval screen.
--
-- Approval can still be forced with a confirmation where documents were
-- collected on paper.

SELECT e."employeeId",
       e."firstName" || ' ' || COALESCE(e."lastName", '') AS name,
       o."status"                                         AS onboarding_status,
       ARRAY(SELECT t FROM unnest(ARRAY['AADHAAR','PAN','PHOTO','BANK_DETAILS']) AS t
              WHERE t NOT IN (SELECT upper(d."type") FROM "EmployeeDocument" d
                               WHERE d."employeeId" = e."id"))
                                                          AS missing_documents
FROM "OnboardingRecord" o
JOIN "Employee" e ON e."id" = o."employeeId"
WHERE o."status" <> 'COMPLETED'
ORDER BY cardinality(
    ARRAY(SELECT t FROM unnest(ARRAY['AADHAAR','PAN','PHOTO','BANK_DETAILS']) AS t
           WHERE t NOT IN (SELECT upper(d."type") FROM "EmployeeDocument" d
                            WHERE d."employeeId" = e."id"))
) DESC;


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Duplicate KYC documents
-- ═══════════════════════════════════════════════════════════════════════════
-- The joining form re-sent every file on each retry, and nothing on the server
-- deduped, so one applicant could accumulate the same Aadhaar and PAN dozens of
-- times. Prevented going forward; the copies already stored are listed here.

SELECT e."employeeId",
       e."firstName" || ' ' || COALESCE(e."lastName", '') AS name,
       d."type",
       count(*)                                           AS copies
FROM "EmployeeDocument" d
JOIN "Employee" e ON e."id" = d."employeeId"
WHERE upper(d."type") IN ('AADHAAR','PAN','PHOTO','BANK_DETAILS')
GROUP BY e."employeeId", e."firstName", e."lastName", d."type"
HAVING count(*) > 1
ORDER BY copies DESC, e."employeeId";


-- Clean-up: keeps the NEWEST file of each single-instance type per employee and
-- removes the older copies. Review the SELECT above first.
--
-- BEGIN;
-- DELETE FROM "EmployeeDocument" d
--  WHERE upper(d."type") IN ('AADHAAR','PAN','PHOTO','BANK_DETAILS')
--    AND d."id" NOT IN (
--        SELECT DISTINCT ON ("employeeId", upper("type")) "id"
--          FROM "EmployeeDocument"
--         WHERE upper("type") IN ('AADHAAR','PAN','PHOTO','BANK_DETAILS')
--         ORDER BY "employeeId", upper("type"), "uploadedAt" DESC
--    );
-- COMMIT;
