// ─── Permission Definitions (shared between admin roles UI and access checks) ─

export const PERMISSION_GROUPS = [
    {
        group: "Employees",
        key: "employees",
        permissions: [
            { key: "employees.view",   label: "View Employees" },
            { key: "employees.create", label: "Add Employee" },
            { key: "employees.edit",   label: "Edit Employee" },
            { key: "employees.delete", label: "Delete Employee" },
        ]
    },
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
        group: "Documents",
        key: "documents",
        permissions: [
            { key: "documents.view",   label: "View Documents" },
            { key: "documents.upload", label: "Upload Documents" },
            { key: "documents.verify", label: "Verify Documents" },
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
        group: "Performance",
        key: "performance",
        permissions: [
            { key: "performance.view",   label: "View Performance" },
            { key: "performance.manage", label: "Manage Reviews & KPIs" },
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
        group: "Recruitment",
        key: "recruitment",
        permissions: [
            { key: "recruitment.view",   label: "View Recruitment" },
            { key: "recruitment.manage", label: "Manage Candidates" },
        ]
    },
    {
        group: "Reports",
        key: "reports",
        permissions: [
            { key: "reports.view",   label: "View Reports" },
            { key: "reports.export", label: "Export Reports" },
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
    {
        group: "LMS",
        key: "lms",
        permissions: [
            { key: "lms.view",   label: "View Courses" },
            { key: "lms.manage", label: "Manage Courses & Enrollments" },
        ]
    },
]

// ─── Access Check Helper ─────────────────────────────────────────────────────
// Use in API routes and page-level checks.
// - ADMIN always passes
// - allowedRoles: system roles that have access (backward compat)
// - permission: custom role permission key that also grants access

export function checkAccess(
    session: { user: { role: string; permissions?: string[] } } | null,
    allowedRoles: string[],
    permission?: string
): boolean {
    if (!session) return false
    const role = session.user.role
    if (role === "ADMIN") return true
    // If user has a custom role AND a permission key is specified:
    // use ONLY the custom permissions — system role does NOT grant access.
    // This ensures different custom roles (e.g. "Quality Engineer" vs "HR Recruiter")
    // get exactly the access their role defines, not the broader system role access.
    if (permission && session.user.permissions?.length) {
        return session.user.permissions.includes(permission)
    }
    // No custom role or no permission key: fall back to system role
    return allowedRoles.includes(role)
}
