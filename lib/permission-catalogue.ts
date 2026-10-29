// ─── Permission catalogue ────────────────────────────────────────────────────
// The single source of truth for what a role can hold (Role & User Manager
// spec, 25 Oct 2026). Safe to import on the client: the role editor renders
// its matrix from MODULES / SPECIAL_ACTIONS / SENSITIVE_FIELDS, and the API
// rejects any permission string not listed here.
//
// A permission is `module.action`. Older roles still hold the earlier keys
// (`leaves.manage`, `projects.manage`…) and ~250 routes check those, so the
// catalogue keys are expanded into the earlier ones at sign-in
// (expandPermissions). A route can check either spelling.

export const ACTIONS = ["view", "create", "edit", "delete", "approve", "export", "import"] as const
export type Action = typeof ACTIONS[number]

export const ACTION_LABELS: Record<Action, string> = {
    view: "View", create: "Create", edit: "Edit", delete: "Delete",
    approve: "Approve", export: "Export", import: "Import",
}

export const ACTION_SHORT: Record<Action, string> = {
    view: "V", create: "C", edit: "E", delete: "D", approve: "A", export: "X", import: "I",
}

export type ModuleDef = {
    key: string
    label: string
    group: string
    actions: Action[]
}

// Order and grouping follow the role editor design.
export const MODULES: ModuleDef[] = [
    { key: "dashboard",     label: "Dashboard",               group: "Inspections",    actions: ["view"] },
    { key: "projects",      label: "Inspection (sites, projects)", group: "Inspections", actions: ["view", "create", "edit", "delete", "export"] },
    { key: "approvals",     label: "Approvals",               group: "Inspections",    actions: ["view", "approve", "export"] },
    { key: "assignments",   label: "Assignments",             group: "Inspections",    actions: ["view", "create", "edit", "delete"] },

    { key: "employees",     label: "Employees",               group: "Workforce",      actions: ["view", "create", "edit", "delete", "export", "import"] },
    { key: "recruitment",   label: "Recruitment",             group: "Workforce",      actions: ["view", "create", "edit", "delete", "export", "import"] },
    { key: "jobs",          label: "Jobs",                    group: "Workforce",      actions: ["view", "create", "edit", "delete", "export"] },
    { key: "onboarding",    label: "Onboarding",              group: "Workforce",      actions: ["view", "edit", "approve"] },
    { key: "policies",      label: "Policies",                group: "Workforce",      actions: ["view", "create", "edit", "delete"] },
    { key: "documents",     label: "Documents",               group: "Workforce",      actions: ["view", "create", "delete", "approve", "export"] },

    { key: "attendance",    label: "Attendance",              group: "HR operations",  actions: ["view", "create", "edit", "export", "import"] },
    { key: "leaves",        label: "Leaves",                  group: "HR operations",  actions: ["view", "create", "edit", "approve", "export"] },
    { key: "payroll",       label: "Payroll",                 group: "HR operations",  actions: ["view", "edit", "export", "import"] },
    { key: "assets",        label: "Assets",                  group: "HR operations",  actions: ["view", "create", "edit", "delete", "approve", "export"] },
    { key: "expenses",      label: "Expenses",                group: "HR operations",  actions: ["view", "create", "edit", "delete", "approve", "export"] },
    { key: "exit",          label: "Exit",                    group: "HR operations",  actions: ["view", "create", "edit", "approve"] },

    { key: "performance",   label: "Performance",             group: "Talent and growth", actions: ["view", "create", "edit", "approve"] },
    { key: "lms",           label: "Training (LMS)",          group: "Talent and growth", actions: ["view", "create", "edit", "delete", "export"] },

    { key: "announcements", label: "Announcements",           group: "Operations and analytics", actions: ["view", "create", "edit", "delete"] },
    { key: "helpdesk",      label: "Helpdesk",                group: "Operations and analytics", actions: ["view", "create", "edit"] },
    { key: "reports",       label: "Analytics and reports",   group: "Operations and analytics", actions: ["view", "export"] },

    { key: "departments",   label: "Departments",             group: "Configuration",  actions: ["view", "create", "edit", "delete"] },
    { key: "users",         label: "Users",                   group: "Configuration",  actions: ["view", "create", "edit", "export", "import"] },
    { key: "roles",         label: "Roles",                   group: "Configuration",  actions: ["view", "create", "edit", "delete"] },
    { key: "rulebook",      label: "Rule book and doc types", group: "Configuration",  actions: ["view", "edit"] },
    { key: "audit",         label: "Audit log",               group: "Configuration",  actions: ["view", "export"] },
]

export type SpecialDef = { key: string; label: string; hint: string; module: string; warn?: boolean }

// One-off switches that are not a plain view/create/edit… on a module.
export const SPECIAL_ACTIONS: SpecialDef[] = [
    { key: "inspection.submit",    label: "Submit inspections",   hint: "Field inspection forms",                        module: "projects" },
    { key: "projects.manager",     label: "Project manager",      hint: "Shown as Manager on site teams; can be picked as a project's manager", module: "projects" },
    { key: "assets.issue",         label: "Issue assets",         hint: "Hand approved items to employees",              module: "assets" },
    { key: "documents.send",       label: "Send letters",         hint: "Appointment, warning and other letters",        module: "documents" },
    { key: "jobs.publish",         label: "Publish job posts",    hint: "Make a draft job public",                       module: "jobs" },
    { key: "policies.publish",     label: "Publish policies",     hint: "Joiners must sign published policies",          module: "policies" },
    { key: "attendance.rules",     label: "Change attendance rules", hint: "Shifts, grace time, OT",                     module: "attendance" },
    { key: "leaves.policy",        label: "Change leave policy",  hint: "Leave types and yearly balances",               module: "leaves" },
    { key: "helpdesk.assign",      label: "Assign tickets",       hint: "Route tickets to a person",                     module: "helpdesk" },
    { key: "payroll.lock",         label: "Lock payroll month",   hint: "Rows can no longer be edited",                  module: "payroll", warn: true },
    { key: "payroll.unlock",       label: "Unlock a locked month", hint: "Recommended for Admin only",                   module: "payroll", warn: true },
    { key: "payroll.markPaid",     label: "Mark salaries paid",   hint: "Releases payslips",                             module: "payroll", warn: true },
    { key: "expenses.markPaid",    label: "Mark expenses paid",   hint: "After the transfer is made",                    module: "expenses" },
    { key: "exit.settleFnF",       label: "Settle F&F",           hint: "Close full and final settlement",               module: "exit", warn: true },
    { key: "users.resetLogin",     label: "Reset logins",         hint: "Clears MPIN, forces OTP",                       module: "users", warn: true },
    { key: "users.deactivate",     label: "Disable users",        hint: "Blocks sign-in at once",                        module: "users", warn: true },
    { key: "employees.bulkUpdate", label: "Bulk update employees", hint: "Change many employee records from a sheet",    module: "employees", warn: true },
    { key: "lms.enroll",           label: "Enrol learners",       hint: "Assign courses to people",                      module: "lms" },
]

export type SensitiveDef = { key: string; label: string; hint: string; fields: string[] }

// Off means the server never sends these fields to the role. They show masked.
export const SENSITIVE_FIELDS: SensitiveDef[] = [
    {
        key: "employees.viewSalary", label: "View salary", hint: "Basic, structure, CTC, payslip amounts",
        fields: ["basicSalary", "salaryType", "employeeSalary", "salaryRevisions"],
    },
    {
        key: "employees.viewKyc", label: "View Aadhaar, PAN, UAN, PF, ESI", hint: "Shown masked when off",
        fields: ["aadharNumber", "panNumber", "uan", "pfNumber", "esiNumber", "labourCardNo", "labourCardExpDate", "nameAsPerAadhar"],
    },
    {
        key: "employees.viewBank", label: "View bank details", hint: "Account number, IFSC, bank name",
        fields: ["bankAccountNumber", "bankIFSC", "bankName", "bankBranch"],
    },
    {
        key: "employees.viewPersonal", label: "View personal details", hint: "Date of birth, address, medical, caste",
        fields: [
            "dateOfBirth", "address", "city", "state", "pincode", "permanentAddress", "permanentCity", "permanentState",
            "permanentPincode", "caste", "religion", "maritalStatus", "marriageDate", "bloodGroup", "fathersName",
            "medicalRemark", "isMedicalDone", "isHandicap",
        ],
    },
]

// Never leaves the server, whatever the role.
export const NEVER_RETURNED = ["onboardingToken"]

// ─── Data scope ──────────────────────────────────────────────────────────────

export const SCOPES = ["ALL", "ASSIGNED_SITES", "MY_TEAM", "SELF"] as const
export type DataScope = typeof SCOPES[number]

export const SCOPE_INFO: Record<DataScope, { label: string; hint: string }> = {
    ALL:            { label: "All",            hint: "Every record in the company" },
    ASSIGNED_SITES: { label: "Assigned sites", hint: "Only the sites set on each user" },
    MY_TEAM:        { label: "My team",        hint: "People who report to them, 2 levels" },
    SELF:           { label: "Self only",      hint: "Only their own records" },
}

export function isScope(v: unknown): v is DataScope {
    return typeof v === "string" && (SCOPES as readonly string[]).includes(v)
}

// ─── Validation ──────────────────────────────────────────────────────────────

export const SELF_PERMISSION = "self.view"

export function modulePermission(module: string, action: Action) {
    return `${module}.${action}`
}

const CATALOGUE_KEYS = new Set<string>([
    SELF_PERMISSION,
    ...MODULES.flatMap(m => m.actions.map(a => modulePermission(m.key, a))),
    ...SPECIAL_ACTIONS.map(s => s.key),
    ...SENSITIVE_FIELDS.map(s => s.key),
])

export function isCataloguePermission(p: string) {
    return CATALOGUE_KEYS.has(p)
}

export function allCataloguePermissions(): string[] {
    return Array.from(CATALOGUE_KEYS)
}

// Ticking any action ticks view; a module with no view holds nothing.
export function normalizePermissions(input: string[]): string[] {
    const set = new Set(input.filter(isCataloguePermission))
    for (const m of MODULES) {
        const any = m.actions.some(a => set.has(modulePermission(m.key, a)))
        if (any) set.add(modulePermission(m.key, "view"))
    }
    set.add(SELF_PERMISSION)
    return Array.from(set).sort()
}

// ─── Earlier keys ────────────────────────────────────────────────────────────
// Catalogue key → the keys existing routes and pages check. Expanded at
// sign-in, so a role saved in the new editor keeps every older screen working.

const ALIASES: Record<string, string[]> = {
    "projects.view":        ["projects.view", "sites.view", "field.view", "groups.view"],
    "projects.create":      ["projects.manage", "sites.manage", "field.manage", "groups.manage"],
    "projects.edit":        ["projects.manage", "sites.manage", "field.manage", "groups.manage"],
    "projects.delete":      ["projects.manage", "sites.manage", "field.manage", "groups.manage"],
    "inspection.submit":    ["inspection.view", "inspection.submit", "inspection.history"],
    "approvals.approve":    ["approvals.manage"],
    "assignments.create":   ["assignments.manage"],
    "assignments.edit":     ["assignments.manage"],
    "assignments.delete":   ["assignments.manage"],
    "recruitment.create":   ["recruitment.manage"],
    "recruitment.edit":     ["recruitment.manage"],
    "recruitment.delete":   ["recruitment.manage"],
    "recruitment.import":   ["recruitment.manage"],
    "jobs.create":          ["jobs.manage"],
    "jobs.edit":            ["jobs.manage"],
    "jobs.delete":          ["jobs.manage"],
    "jobs.publish":         ["jobs.manage"],
    "onboarding.edit":      ["onboarding.manage"],
    "onboarding.approve":   ["onboarding.manage"],
    "policies.view":        ["policy.view", "policy.report"],
    "policies.create":      ["policy.manage"],
    "policies.edit":        ["policy.manage"],
    "policies.delete":      ["policy.manage"],
    "policies.publish":     ["policy.manage"],
    "documents.create":     ["documents.upload"],
    "documents.delete":     ["documents.upload"],
    "documents.approve":    ["documents.verify"],
    "attendance.create":    ["attendance.manage"],
    "attendance.edit":      ["attendance.manage"],
    "attendance.import":    ["attendance.manage"],
    "attendance.rules":     ["attendance.manage"],
    "leaves.create":        ["leaves.manage"],
    "leaves.edit":          ["leaves.manage"],
    "leaves.policy":        ["leaves.manage"],
    "payroll.edit":         ["payroll.manage"],
    "payroll.import":       ["payroll.manage"],
    "assets.create":        ["assets.request"],
    "assets.edit":          ["assets.issue"],
    "assets.delete":        ["assets.issue"],
    "expenses.approve":     ["expenses.manage"],
    "expenses.markPaid":    ["expenses.manage"],
    "exit.create":          ["exit.manage"],
    "exit.edit":            ["exit.manage"],
    "exit.approve":         ["exit.manage"],
    "exit.settleFnF":       ["exit.manage"],
    "performance.create":   ["performance.manage"],
    "performance.edit":     ["performance.manage"],
    "performance.approve":  ["performance.manage"],
    "lms.create":           ["lms.manage"],
    "lms.edit":             ["lms.manage"],
    "lms.delete":           ["lms.manage"],
    "lms.enroll":           ["lms.manage"],
    "announcements.create": ["announcements.manage"],
    "announcements.edit":   ["announcements.manage"],
    "announcements.delete": ["announcements.manage"],
    "helpdesk.create":      ["helpdesk.manage"],
    "helpdesk.edit":        ["helpdesk.manage"],
    "helpdesk.assign":      ["helpdesk.manage"],
    "users.edit":           ["users.manage"],
}

/**
 * Everything a session should carry for these stored permissions: the keys
 * themselves plus the earlier keys they stand for. Under a Self-only scope the
 * Inspection module means "my own inspections", not every site and project.
 */
export function expandPermissions(stored: string[], scope: DataScope | null): string[] {
    const out = new Set<string>(stored)
    for (const p of stored) {
        if (p === "projects.view" && scope === "SELF") {
            out.delete("projects.view")
            for (const k of ["inspection.view", "inspection.history"]) out.add(k)
            continue
        }
        for (const k of ALIASES[p] ?? []) out.add(k)
    }
    out.add(SELF_PERMISSION)
    return Array.from(out)
}

// Earlier key → catalogue keys, for converting a role saved before the
// catalogue existed. Keys with no catalogue meaning (billing.*, companies.*)
// are dropped.
const LEGACY_TO_CATALOGUE: Record<string, string[]> = {
    "projects.view": ["projects.view"], "projects.manage": ["projects.view", "projects.create", "projects.edit", "projects.delete"],
    "sites.view": ["projects.view"], "sites.manage": ["projects.view", "projects.create", "projects.edit", "projects.delete"],
    "field.view": ["projects.view"], "field.manage": ["projects.view", "projects.edit"],
    "groups.view": ["projects.view"], "groups.manage": ["projects.view", "projects.edit"],
    "inspection.view": ["inspection.submit"], "inspection.submit": ["inspection.submit"], "inspection.history": ["inspection.submit"],
    "approvals.view": ["approvals.view"], "approvals.manage": ["approvals.view", "approvals.approve"],
    "assignments.view": ["assignments.view"], "assignments.manage": ["assignments.view", "assignments.create", "assignments.edit", "assignments.delete"],
    "employees.view": ["employees.view"], "employees.create": ["employees.create"], "employees.edit": ["employees.edit"],
    "employees.delete": ["employees.delete"], "employees.viewSalary": ["employees.viewSalary"],
    "recruitment.view": ["recruitment.view"], "recruitment.manage": ["recruitment.create", "recruitment.edit", "recruitment.delete"],
    "jobs.view": ["jobs.view"], "jobs.manage": ["jobs.create", "jobs.edit", "jobs.delete", "jobs.publish"],
    "onboarding.view": ["onboarding.view"], "onboarding.manage": ["onboarding.edit", "onboarding.approve"],
    "policy.view": ["policies.view"], "policy.report": ["policies.view"], "policy.manage": ["policies.create", "policies.edit", "policies.delete", "policies.publish"],
    "documents.view": ["documents.view"], "documents.upload": ["documents.create"], "documents.verify": ["documents.approve"], "documents.send": ["documents.send"],
    "attendance.view": ["attendance.view"], "attendance.manage": ["attendance.create", "attendance.edit", "attendance.import"],
    "leaves.view": ["leaves.view"], "leaves.manage": ["leaves.create", "leaves.edit"], "leaves.approve": ["leaves.approve"],
    "payroll.view": ["payroll.view"], "payroll.manage": ["payroll.edit", "payroll.import", "payroll.lock", "payroll.markPaid"],
    "assets.view": ["assets.view"], "assets.request": ["assets.create"],
    "assets.manage": ["assets.create", "assets.edit", "assets.delete", "assets.approve", "assets.issue"],
    "expenses.view": ["expenses.view"], "expenses.manage": ["expenses.approve", "expenses.markPaid"],
    "exit.view": ["exit.view"], "exit.manage": ["exit.create", "exit.edit", "exit.approve", "exit.settleFnF"],
    "performance.view": ["performance.view"], "performance.manage": ["performance.create", "performance.edit", "performance.approve"],
    "lms.view": ["lms.view"], "lms.manage": ["lms.create", "lms.edit", "lms.delete", "lms.enroll"],
    "announcements.view": ["announcements.view"], "announcements.manage": ["announcements.create", "announcements.edit", "announcements.delete"],
    "helpdesk.view": ["helpdesk.view"], "helpdesk.manage": ["helpdesk.create", "helpdesk.edit", "helpdesk.assign"],
    "reports.view": ["reports.view"], "reports.export": ["reports.export"],
    "users.manage": ["users.view", "users.edit"],
    "self.view": [SELF_PERMISSION],
}

export function toCataloguePermissions(stored: string[]): string[] {
    const out: string[] = []
    for (const p of stored) {
        // A key that is already in the catalogue means exactly that, even when
        // an earlier key had the same spelling (assets.issue, leaves.approve…).
        if (isCataloguePermission(p)) { out.push(p); continue }
        for (const k of LEGACY_TO_CATALOGUE[p] ?? []) out.push(k)
    }
    return normalizePermissions(out)
}

// ─── Default roles ───────────────────────────────────────────────────────────
// The ten roles the spec ships (Admin is the built-in system role and is not
// listed). Letters: V view · C create · E edit · D delete · A approve ·
// X export · I import.

type Grid = Record<string, string>
const LETTER: Record<string, Action> = { V: "view", C: "create", E: "edit", D: "delete", A: "approve", X: "export", I: "import" }

function fromGrid(grid: Grid, extra: string[] = []): string[] {
    const out: string[] = []
    for (const [module, letters] of Object.entries(grid)) {
        for (const ch of letters.replace(/\s+/g, "")) {
            const action = LETTER[ch]
            if (action) out.push(modulePermission(module, action))
        }
    }
    return normalizePermissions([...out, ...extra])
}

export type DefaultRole = { name: string; description: string; color: string; scope: DataScope; permissions: string[] }

export const DEFAULT_ROLES: DefaultRole[] = [
    {
        name: "HR Executive", color: "#6366f1", scope: "ALL",
        description: "Employees, joining, leaves, exits, policies and letters.",
        permissions: fromGrid({
            dashboard: "V", projects: "V", approvals: "V", assignments: "VCE", employees: "VCEXI", recruitment: "VCEDXI",
            jobs: "VCEDX", onboarding: "VEA", policies: "VCED", documents: "VCDAX", attendance: "VCEXI", leaves: "VCEAX",
            assets: "VCEDAX", expenses: "V", exit: "VCEA", performance: "VCEA", lms: "VCEDX", announcements: "VCED",
            helpdesk: "VCE", reports: "VX", departments: "VCED", users: "V", audit: "V",
        }, ["jobs.publish", "policies.publish", "documents.send", "attendance.rules", "leaves.policy", "exit.settleFnF",
            "lms.enroll", "helpdesk.assign", "employees.viewKyc", "employees.viewPersonal"]),
    },
    {
        name: "HR Recruiter", color: "#a855f7", scope: "ALL",
        description: "Candidates and job posts. Reads employees.",
        permissions: fromGrid({
            dashboard: "V", employees: "V", recruitment: "VCEDXI", jobs: "VCE", onboarding: "V", documents: "VC",
            announcements: "V", helpdesk: "V", reports: "V",
        }, ["jobs.publish", "employees.viewPersonal"]),
    },
    {
        name: "Payroll Executive", color: "#10b981", scope: "ALL",
        description: "Wage sheet, lock month, PF/ESIC, payslips. Sees salary and bank.",
        permissions: fromGrid({
            dashboard: "V", employees: "VEX", attendance: "VXI", leaves: "VX", payroll: "VEXI", assets: "V",
            expenses: "VAX", exit: "V", announcements: "V", helpdesk: "VCE", reports: "VX",
        }, ["payroll.lock", "payroll.markPaid", "expenses.markPaid", "exit.settleFnF", "employees.viewSalary",
            "employees.viewKyc", "employees.viewBank"]),
    },
    {
        name: "MIS Executive", color: "#f59e0b", scope: "ALL",
        description: "Sites, inspections, attendance uploads and reports.",
        permissions: fromGrid({
            dashboard: "V", projects: "VCEDX", approvals: "VAX", assignments: "VCED", employees: "VCEXI", recruitment: "VX",
            jobs: "V", onboarding: "V", policies: "V", documents: "VX", attendance: "VCEXI", leaves: "VX", payroll: "VX",
            assets: "VX", expenses: "VX", performance: "V", lms: "VX", announcements: "VCE", helpdesk: "VCE", reports: "VX",
            departments: "V", users: "V", audit: "V",
        }, ["employees.bulkUpdate", "assets.issue", "helpdesk.assign", "projects.manager"]),
    },
    {
        name: "Operation Manager", color: "#3b82f6", scope: "ASSIGNED_SITES",
        description: "Runs assigned sites. Approves inspections, leaves and expenses.",
        permissions: fromGrid({
            dashboard: "V", projects: "V", approvals: "VA", assignments: "V", employees: "V", attendance: "VCE",
            leaves: "VA", assets: "V", expenses: "VA", exit: "V", performance: "VCEA", lms: "V", announcements: "V",
            helpdesk: "V", reports: "VX",
        }, ["assets.issue", "projects.manager"]),
    },
    {
        name: "Quality Supervisor", color: "#0ea5e9", scope: "ASSIGNED_SITES",
        description: "Approves inspections for assigned sites.",
        permissions: fromGrid({
            dashboard: "V", projects: "VX", approvals: "VA", assignments: "V", employees: "V", attendance: "V",
            leaves: "VA", expenses: "V", performance: "VCE", lms: "V", announcements: "V", helpdesk: "V", reports: "VX",
        }, ["projects.manager"]),
    },
    {
        name: "Quality Engineer", color: "#22c55e", scope: "SELF",
        description: "Submits inspections. Own leaves, expenses and tickets.",
        permissions: fromGrid({ dashboard: "V", projects: "V" }, ["inspection.submit"]),
    },
    {
        name: "Inspector", color: "#06b6d4", scope: "SELF",
        description: "Replaces the hidden Inspection Boy role. Submits inspections only.",
        permissions: fromGrid({ dashboard: "V", projects: "V" }, ["inspection.submit"]),
    },
    {
        name: "Employee", color: "#64748b", scope: "SELF",
        description: "Self-service: own profile, payslips, leave, expenses, tickets.",
        permissions: fromGrid({ dashboard: "V" }),
    },
]
