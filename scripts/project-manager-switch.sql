-- Turn on the "Project manager" role switch (permission key: projects.manager)
-- for the roles that should appear in the manager list and get the Manager
-- badge on site teams. Each of these roles can approve inspections; HR
-- Executive is left out because it can't.
--
-- Same effect as ticking Roles → <role> → "Project manager" in the app.
-- Safe to run more than once.

UPDATE "CustomRole"
SET permissions = array_append(permissions, 'projects.manager'),
    "updatedAt" = now()
WHERE name IN ('Operation Manager', 'Quality Supervisor', 'MIS Executive', 'Operation Head')
  AND NOT ('projects.manager' = ANY(permissions))
RETURNING name;
