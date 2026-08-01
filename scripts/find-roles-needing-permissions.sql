-- Which custom roles lost access when writes stopped being gated on `.view`?
--
-- Before the fix, holding `attendance.view` was enough to mark attendance and
-- `leaves.view` was enough to approve leave. Those now require `.manage` /
-- `.approve`. Any active role in this result was relying on that gap and can no
-- longer do the action — grant it the permission in `missing` via Admin → Roles,
-- or leave it read-only if that was the intent all along.

SELECT
    r.name                                   AS role_name,
    u.affected_users,
    CASE
        WHEN 'attendance.view' = ANY(r.permissions)
             AND NOT 'attendance.manage' = ANY(r.permissions)
        THEN 'attendance.manage'
    END                                      AS missing_attendance,
    CASE
        WHEN 'leaves.view' = ANY(r.permissions)
             AND NOT 'leaves.approve' = ANY(r.permissions)
             AND NOT 'leaves.manage'  = ANY(r.permissions)
        THEN 'leaves.approve (and leaves.manage to file leave for others)'
    END                                      AS missing_leaves,
    CASE
        WHEN 'recruitment.view' = ANY(r.permissions)
             AND NOT 'recruitment.manage' = ANY(r.permissions)
        THEN 'recruitment.manage (only if they should delete candidates)'
    END                                      AS missing_recruitment
FROM "CustomRole" r
LEFT JOIN LATERAL (
    SELECT count(*) AS affected_users
    FROM "User" usr
    WHERE usr."customRoleId" = r.id AND usr."isActive"
) u ON true
WHERE r."isActive"
  AND (
        ('attendance.view'  = ANY(r.permissions) AND NOT 'attendance.manage'  = ANY(r.permissions))
     OR ('leaves.view'      = ANY(r.permissions) AND NOT 'leaves.approve'     = ANY(r.permissions)
                                                AND NOT 'leaves.manage'       = ANY(r.permissions))
     OR ('recruitment.view' = ANY(r.permissions) AND NOT 'recruitment.manage' = ANY(r.permissions))
  )
ORDER BY u.affected_users DESC NULLS LAST, r.name;
