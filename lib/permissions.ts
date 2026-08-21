// ─── Permission Definitions ──────────────────────────────────────────────────
// Used by:
//   1. Admin → Roles UI (to build the permission checklist)
//   2. Sidebar (to show / hide nav items)
//   3. API routes + page guards (via checkAccess)
//
// Groups are ordered to match the sidebar sections so admins picking
// permissions for a custom role see a familiar layout.

export const PERMISSION_GROUPS = [

    // ── MY WORKSPACE (employee self-service) ─────────────────────────────────
    // Grants an employee access to their OWN data only: profile, payslip,
    // documents, attendance, leaves, and raising helpdesk tickets. All these
    // surfaces scope strictly to the user's linked employee record server-side.
    {
        group: "My Workspace (Self-Service)",
        key: "self",
        permissions: [
            { key: "self.view", label: "Employee Self-Service (own profile, payslip, leaves, attendance, helpdesk)" },
        ]
    },

    // ── INSPECTIONS ──────────────────────────────────────────────────────────
    {
        group: "Projects",
        key: "projects",
        permissions: [
            { key: "projects.view",   label: "View Projects" },
            { key: "projects.manage", label: "Create / Edit / Delete Projects" },
        ]
    },
    {
        group: "Assignments",
        key: "assignments",
        permissions: [
            { key: "assignments.view",   label: "View Assignments" },
            { key: "assignments.manage", label: "Create / Edit / Delete Assignments" },
        ]
    },
    {
        group: "Sites",
        key: "sites",
        permissions: [
            { key: "sites.view",   label: "View Sites" },
            { key: "sites.manage", label: "Create / Edit / Delete Sites" },
        ]
    },
    {
        group: "Groups",
        key: "groups",
        permissions: [
            { key: "groups.view",   label: "View Groups" },
            { key: "groups.manage", label: "Manage Groups" },
        ]
    },
    {
        group: "Field Tasks",
        key: "field",
        permissions: [
            { key: "field.view",   label: "View Field Tasks" },
            { key: "field.manage", label: "Assign / Manage Field Tasks" },
        ]
    },
    {
        group: "Inspection (Inspector)",
        key: "inspection",
        permissions: [
            { key: "inspection.view",    label: "View Assigned Inspections" },
            { key: "inspection.submit",  label: "Submit Inspection Report" },
            { key: "inspection.history", label: "View Inspection History" },
        ]
    },

    // ── WORKFORCE ────────────────────────────────────────────────────────────
    {
        group: "Employees",
        key: "employees",
        permissions: [
            { key: "employees.view",       label: "View Employees" },
            { key: "employees.create",     label: "Add Employee" },
            { key: "employees.edit",       label: "Edit Employee" },
            { key: "employees.delete",     label: "Delete Employee" },
            { key: "employees.viewSalary", label: "View Salary & CTC" },
        ]
    },
    {
        group: "Recruitment",
        key: "recruitment",
        permissions: [
            { key: "recruitment.view",   label: "View Recruitment" },
            { key: "recruitment.manage", label: "Manage Candidates" },
        ]
    },
    {
        group: "Jobs",
        key: "jobs",
        permissions: [
            { key: "jobs.view",   label: "View Job Postings" },
            { key: "jobs.manage", label: "Post / Edit / Close Jobs" },
        ]
    },
    {
        group: "Onboarding",
        key: "onboarding",
        permissions: [
            { key: "onboarding.view",   label: "View Onboarding" },
            { key: "onboarding.manage", label: "Manage Onboarding" },
        ]
    },
    {
        group: "Documents",
        key: "documents",
        permissions: [
            { key: "documents.view",   label: "View Documents" },
            { key: "documents.send",   label: "Send / Issue Documents" },
            { key: "documents.upload", label: "Upload Documents" },
            { key: "documents.verify", label: "Verify Documents" },
        ]
    },

    // ── HR OPERATIONS ────────────────────────────────────────────────────────
    {
        group: "Attendance",
        key: "attendance",
        permissions: [
            { key: "attendance.view",   label: "View Attendance" },
            { key: "attendance.manage", label: "Mark / Edit Attendance" },
        ]
    },
    {
        group: "Leaves",
        key: "leaves",
        permissions: [
            { key: "leaves.view",    label: "View Leaves" },
            { key: "leaves.manage",  label: "Manage Leaves" },
            { key: "leaves.approve", label: "Approve / Reject Leaves" },
        ]
    },
    {
        group: "Payroll",
        key: "payroll",
        permissions: [
            { key: "payroll.view",   label: "View Payroll" },
            { key: "payroll.manage", label: "Process Payroll" },
        ]
    },
    {
        group: "Assets",
        key: "assets",
        permissions: [
            { key: "assets.view",   label: "View Assets" },
            { key: "assets.manage", label: "Assign / Return Assets" },
        ]
    },
    {
        group: "Expenses",
        key: "expenses",
        permissions: [
            { key: "expenses.view",   label: "View Expenses" },
            { key: "expenses.manage", label: "Approve / Reject Expenses" },
        ]
    },

    // ── TALENT & GROWTH ──────────────────────────────────────────────────────
    {
        group: "Performance",
        key: "performance",
        permissions: [
            { key: "performance.view",   label: "View Performance" },
            { key: "performance.manage", label: "Manage Reviews & KPIs" },
        ]
    },
    {
        group: "Exit Management",
        key: "exit",
        permissions: [
            { key: "exit.view",   label: "View Exit Requests" },
            { key: "exit.manage", label: "Process Exit Clearances" },
        ]
    },
    {
        group: "Training (LMS)",
        key: "lms",
        permissions: [
            { key: "lms.view",   label: "View Courses" },
            { key: "lms.manage", label: "Manage Courses & Enrollments" },
        ]
    },

    // ── OPERATIONS ───────────────────────────────────────────────────────────
    {
        group: "Announcements",
        key: "announcements",
        permissions: [
            { key: "announcements.view",   label: "View Announcements & Holidays" },
            { key: "announcements.manage", label: "Post / Edit Announcements & Holidays" },
        ]
    },
    {
        group: "Approvals",
        key: "approvals",
        permissions: [
            { key: "approvals.view",   label: "View Approval Queue" },
            { key: "approvals.manage", label: "Approve / Reject Items" },
        ]
    },
    {
        group: "Helpdesk",
        key: "helpdesk",
        permissions: [
            { key: "helpdesk.view",   label: "View Tickets" },
            { key: "helpdesk.manage", label: "Manage Tickets" },
        ]
    },

    // ── ANALYTICS ────────────────────────────────────────────────────────────
    {
        group: "Reports & Analytics",
        key: "reports",
        permissions: [
            { key: "reports.view",   label: "View Reports & Analytics" },
            { key: "reports.export", label: "Export Reports" },
        ]
    },

    // ── ADMINISTRATION ───────────────────────────────────────────────────────
    // Grants access to the Employee Logins screen: view, copy and update every
    // employee's login id / password and assigned role. Sensitive — give only
    // to trusted roles (e.g. HR / IT admins).
    {
        group: "User & Login Management",
        key: "users",
        permissions: [
            { key: "users.manage", label: "Employee Login Management (view & edit login IDs, passwords, roles)" },
        ]
    },
]

// ─── Default Permissions per System Role ─────────────────────────────────────
// When a MANAGER or HR_MANAGER user has no customRole assigned, they get these
// permissions injected into their JWT so pages can do pure permission checks.

export const MANAGER_DEFAULT_PERMISSIONS: string[] = [
    "projects.view", "projects.manage",
    "assignments.view", "assignments.manage",
    "sites.view", "sites.manage",
    "groups.view", "groups.manage",
    "field.view", "field.manage",
    "employees.view", "employees.create", "employees.edit", "employees.delete", "employees.viewSalary",
    "recruitment.view", "recruitment.manage",
    "jobs.view", "jobs.manage",
    "onboarding.view", "onboarding.manage",
    "documents.view", "documents.upload", "documents.send", "documents.verify",
    "attendance.view", "attendance.manage",
    "leaves.view", "leaves.manage", "leaves.approve",
    "payroll.view", "payroll.manage",
    "assets.view", "assets.manage",
    "expenses.view", "expenses.manage",
    "performance.view", "performance.manage",
    "exit.view", "exit.manage",
    "lms.view", "lms.manage",
    "approvals.view", "approvals.manage",
    "helpdesk.view", "helpdesk.manage",
    "reports.view", "reports.export",
    "recruitment.view", "recruitment.manage",
]

export const HR_MANAGER_DEFAULT_PERMISSIONS: string[] = [
    "employees.view", "employees.create", "employees.edit", "employees.delete", "employees.viewSalary",
    "recruitment.view", "recruitment.manage",
    "jobs.view", "jobs.manage",
    "onboarding.view", "onboarding.manage",
    "documents.view", "documents.upload", "documents.verify",
    "attendance.view", "attendance.manage",
    "leaves.view", "leaves.manage", "leaves.approve",
    "payroll.view", "payroll.manage",
    "assets.view", "assets.manage",
    "expenses.view", "expenses.manage",
    "performance.view", "performance.manage",
    "exit.view", "exit.manage",
    "lms.view", "lms.manage",
    "helpdesk.view", "helpdesk.manage",
    "reports.view",
]

// ─── Access Check Helper ─────────────────────────────────────────────────────
// Use in API routes and page-level checks.
// - ADMIN always passes
// - allowedRoles: system roles that have access (backward compat)
// - permission: custom role permission key that also grants access

export function checkAccess(
    session: { user: { role: string; permissions?: string[] } } | null | undefined,
    allowedRoles: string[],
    permission?: string
): boolean {
    if (!session) return false
    // ADMIN is the ONLY role with implicit access. Every other user — including
    // base roles like MANAGER / HR_MANAGER / INSPECTION_BOY / CLIENT — is
    // governed PURELY by custom-role permissions assigned via Admin → Roles,
    // which is the single source of truth. `allowedRoles` is retained for
    // call-site signature compatibility but no longer grants access on its own.
    void allowedRoles
    if (session.user.role === "ADMIN") return true
    return !!(permission && session.user.permissions?.includes(permission))
}

type PermSession = { user: { role: string; permissions?: string[] } } | null | undefined

// ─── Inspector Helpers ───────────────────────────────────────────────────────
// "Is this person an inspector?" is answered by the inspection permissions, NEVER
// by the INSPECTION_BOY base role: every route that assigns a custom role sets the
// base role to MANAGER (fix-login, employee-logins, debug-login, employees/import),
// so a "Quality Inspector" custom role does not carry INSPECTION_BOY at all.

export const INSPECTION_PERMISSIONS = ["inspection.view", "inspection.submit", "inspection.history"]

// Who may be picked as a PROJECT MANAGER. A project manager reviews and approves
// what the inspectors submit and hands out their assignments, so the two "manage"
// capabilities that describe that work are the test. `projects.manage` is
// deliberately NOT here: being allowed to create a project does not make someone a
// candidate to be supervised on one.
export const PROJECT_MANAGER_PERMISSIONS = ["approvals.manage", "assignments.manage"]

// Raw-array form, for callers that only hold a JWT token (e.g. middleware).
export function hasInspectionPermission(permissions: readonly string[] | null | undefined): boolean {
    return INSPECTION_PERMISSIONS.some(p => permissions?.includes(p))
}

// May reach the inspector workspace at all. ADMIN passes (via checkAccess).
export function canAccessInspection(session: PermSession): boolean {
    return INSPECTION_PERMISSIONS.some(p => checkAccess(session, [], p))
}

// Permissions that mean "you oversee this work" rather than "you perform it".
// Holding one of these must cancel inspector self-scoping.
export const ASSIGNMENT_OVERSIGHT_PERMISSIONS = ["assignments.view", "assignments.manage"]

// Should this caller only ever see their OWN rows? ADMIN is deliberately excluded
// — the superuser must keep seeing everyone's work, so self-scoping never catches it.
//
// `oversightPermissions` lists the permissions that make the caller a supervisor
// of the resource being queried. Without it, granting a coordinator EVERY right
// made them see LESS: "all permissions" includes the inspection ones, which made
// them look like an inspector, which narrowed the query to rows where they
// personally were the assigned inspector — usually none, so the screen came up
// empty. Someone who may view assignments is watching other people's work, not
// doing their own.
export function isSelfScopedInspector(
    session: PermSession,
    oversightPermissions: readonly string[] = [],
): boolean {
    if (!session || session.user.role === "ADMIN") return false
    if (!hasInspectionPermission(session.user.permissions)) return false
    const held = session.user.permissions ?? []
    return !oversightPermissions.some(p => held.includes(p))
}

// Sending / issuing documents (Send Documents module, recall, clear, doc types)
// requires the dedicated `documents.send` permission. `documents.view` is a
// read-only permission and does NOT grant send/issue access. (Backward compat
// with roles that lack `documents.send` is handled at the role-assignment UI,
// not here.)
export function canSendDocuments(session: PermSession): boolean {
    return checkAccess(session, [], "documents.send")
}

// Viewing documents is granted by `documents.view` OR, for senders who need to
// see what they issued, `documents.send`.
export function canViewDocuments(session: PermSession): boolean {
    return checkAccess(session, [], "documents.view") || checkAccess(session, [], "documents.send")
}
