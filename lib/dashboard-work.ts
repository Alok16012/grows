// Home page "work panels": each profile (recruiter, payroll, inspector …) sees
// its own to-do counts and actions first. A panel shows only to someone holding
// its rights; Settings (per role) chooses which of those panels and in what order.
import prisma from "@/lib/prisma"
import type { Session } from "next-auth"
import { CLOSED_STAGES } from "@/lib/recruitment"

export const PANELS = [
    { key: "payroll", label: "Payroll — this month", perms: ["payroll.view", "payroll.edit"] },
    { key: "recruiter", label: "Recruiter — hiring today", perms: ["recruitment.view", "recruitment.create", "recruitment.edit"] },
    { key: "inspector", label: "Inspector — my inspections", perms: ["inspection.submit"] },
    { key: "hr", label: "HR — joiners, updates & exits", perms: ["onboarding.view", "onboarding.edit", "onboarding.approve", "exit.edit"] },
    { key: "approvals", label: "Approvals waiting for me", perms: ["leaves.approve", "expenses.approve", "assets.approve"] },
    { key: "inspectionReview", label: "Inspection reviews", perms: ["approvals.approve", "approvals.manage", "projects.edit", "assignments.create"] },
] as const
export type PanelKey = typeof PANELS[number]["key"]
export const PANEL_KEYS = PANELS.map(p => p.key) as PanelKey[]

export type DashboardLayout = { byRole: Record<string, PanelKey[]> }
const KEY = "dashboardLayout"

export function sanitizeLayout(v: any): DashboardLayout {
    const byRole: Record<string, PanelKey[]> = {}
    for (const [role, list] of Object.entries(v?.byRole ?? {})) {
        if (typeof role !== "string" || !Array.isArray(list)) continue
        byRole[role.slice(0, 64)] = Array.from(new Set(list.filter((k): k is PanelKey => PANEL_KEYS.includes(k as PanelKey))))
    }
    return { byRole }
}
export async function getLayout(): Promise<DashboardLayout> {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } }).catch(() => null)
    try { return sanitizeLayout(row?.value ? JSON.parse(row.value) : {}) } catch { return { byRole: {} } }
}
export async function saveLayout(v: unknown, userId: string) {
    const s = sanitizeLayout(v)
    const value = JSON.stringify(s)
    await prisma.appSetting.upsert({ where: { key: KEY }, update: { value, updatedBy: userId }, create: { key: KEY, value, updatedBy: userId } })
    return s
}

const held = (s: Session) => ((s.user as any)?.permissions ?? []) as string[]
const isAdmin = (s: Session) => s.user.role === "ADMIN"
export const qualifies = (s: Session, key: PanelKey) => {
    const p = PANELS.find(x => x.key === key)!
    return isAdmin(s) || p.perms.some(k => held(s).includes(k))
}

/** The panels this person sees, in order: their role's setting, else every panel they qualify for. */
export async function panelsFor(s: Session): Promise<PanelKey[]> {
    const [layout, user] = await Promise.all([getLayout(), prisma.user.findUnique({ where: { id: s.user.id }, select: { customRoleId: true } }).catch(() => null)])
    const roleKey = isAdmin(s) ? "ADMIN" : user?.customRoleId ?? ""
    const chosen = roleKey ? layout.byRole[roleKey] : undefined
    return (chosen ?? PANEL_KEYS).filter(k => qualifies(s, k))
}

type Stat = { label: string; value: number | string; href?: string; tone?: "red" | "amber" | "green" | "blue" | "grey" }
type Action = { label: string; href: string; primary?: boolean }
export type Panel = { key: PanelKey; title: string; subtitle?: string; stats: Stat[]; list?: { title: string; sub?: string; href?: string }[]; actions: Action[] }

const istToday = () => { const d = new Date(Date.now() + 19_800_000); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() - 19_800_000) }
const can = (s: Session, ...k: string[]) => isAdmin(s) || k.some(x => held(s).includes(x))

async function inspector(s: Session): Promise<Panel> {
    const uid = s.user.id
    const today = istToday(), monthStart = new Date(today); monthStart.setUTCDate(1)
    const [active, drafts, sentBack, pending, approvedMonth] = await Promise.all([
        prisma.assignment.count({ where: { inspectionBoyId: uid, status: "active" } }),
        prisma.inspection.count({ where: { submittedBy: uid, status: "draft" } }),
        prisma.inspection.count({ where: { submittedBy: uid, status: "rejected" } }),
        prisma.inspection.count({ where: { submittedBy: uid, status: "pending" } }),
        prisma.inspection.count({ where: { submittedBy: uid, status: "approved", approvedAt: { gte: monthStart } } }),
    ])
    return {
        key: "inspector", title: "My inspections", subtitle: "Today's work at your sites",
        stats: [
            { label: "Active assignments", value: active, href: "/inspection", tone: "blue" },
            { label: "Started, not submitted", value: drafts, href: "/inspection", tone: drafts ? "amber" : "grey" },
            { label: "Sent back to redo", value: sentBack, href: "/inspection", tone: sentBack ? "red" : "grey" },
            { label: "Waiting for approval", value: pending, href: "/inspection", tone: "grey" },
            { label: "Approved this month", value: approvedMonth, tone: "green" },
        ],
        actions: [{ label: "Start inspection", href: "/inspection", primary: true }, { label: "My history", href: "/inspection" }],
    }
}

async function recruiter(s: Session): Promise<Panel> {
    const { myDay } = await import("@/lib/recruitment-server")
    const d: any = await myDay(s as any, true)
    const mineOpen = isAdmin(s) || can(s, "recruitment.approve") ? {} : { assignedTo: s.user.id }
    const monthStart = istToday(); monthStart.setUTCDate(1)
    const [open, joined] = await Promise.all([
        prisma.lead.count({ where: { ...mineOpen, status: { notIn: CLOSED_STAGES as any } } }),
        prisma.lead.count({ where: { ...mineOpen, status: "JOINED" as any, stageChangedAt: { gte: monthStart } } }).catch(() => 0),
    ])
    const iv: any[] = d.interviews ?? []
    return {
        key: "recruiter", title: "Hiring today", subtitle: d.everyone ? "All recruiters" : "Your candidates",
        stats: [
            { label: "Interviews today", value: iv.length, href: "/recruitment/manage", tone: iv.length ? "blue" : "grey" },
            { label: "Follow-ups due", value: (d.followUps ?? []).length, href: "/recruitment/manage", tone: (d.followUps ?? []).length ? "amber" : "grey" },
            { label: "Stuck candidates", value: (d.stuck ?? []).length, href: "/recruitment/manage", tone: (d.stuck ?? []).length ? "red" : "grey" },
            { label: "Offers waiting to join", value: (d.offers ?? []).length, href: "/recruitment/manage", tone: "blue" },
            ...(d.unassigned ? [{ label: "No recruiter yet", value: d.unassigned, href: "/recruitment/manage", tone: "amber" as const }] : []),
            { label: "Open candidates", value: open, href: "/recruitment", tone: "grey" },
            { label: "Joined this month", value: joined, tone: "green" },
        ],
        list: iv.slice(0, 5).map(x => ({ title: x.lead?.candidateName ?? "Interview", sub: [x.title, x.lead?.position, x.scheduledAt ? new Date(x.scheduledAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null].filter(Boolean).join(" · "), href: x.leadId ? `/recruitment?lead=${x.leadId}` : "/recruitment/manage" })),
        actions: [
            ...(can(s, "recruitment.create") ? [{ label: "Add candidate", href: "/recruitment", primary: true }] : []),
            { label: "Hiring desk", href: "/recruitment/manage" },
            { label: "Jobs & Refer", href: can(s, "jobs.view") ? "/jobs" : "/refer" },
            ...(can(s, "onboarding.view", "recruitment.view") ? [{ label: "Join links", href: "/onboarding/join-links" }] : []),
        ],
    }
}

async function hr(s: Session): Promise<Panel> {
    const [waiting, notStarted, updates, exits, docsPending] = await Promise.all([
        prisma.onboardingRecord.count({ where: { status: "IN_PROGRESS" } }),
        prisma.onboardingRecord.count({ where: { status: "NOT_STARTED" } }),
        prisma.employeeChangeRequest.count({ where: { source: "SELF", status: "PENDING" } }).catch(() => 0),
        prisma.exitRequest.count({ where: { status: { notIn: ["COMPLETED", "CANCELLED"] as any } } }).catch(() => 0),
        prisma.employeeDocument.count({ where: { status: "PENDING", employee: { status: { in: ["ACTIVE", "ONBOARDING"] as any } } } }).catch(() => 0),
    ])
    return {
        key: "hr", title: "Joiners, updates & exits",
        stats: [
            { label: "Joiners waiting approval", value: waiting, href: "/onboarding", tone: waiting ? "amber" : "grey" },
            { label: "Joiners not started", value: notStarted, href: "/onboarding", tone: "grey" },
            { label: "Profile updates to approve", value: updates, href: "/employees/changes", tone: updates ? "red" : "grey" },
            { label: "Documents to verify", value: docsPending, href: "/employees/documents", tone: docsPending ? "amber" : "grey" },
            { label: "Open exits", value: exits, href: "/exit", tone: "blue" },
        ],
        actions: [
            { label: "Onboarding", href: "/onboarding", primary: true },
            ...(can(s, "employees.create") ? [{ label: "Add employee", href: "/employees" }] : []),
            { label: "Joining checklist", href: "/onboarding/checklist" },
            ...(can(s, "exit.view", "exit.edit") ? [{ label: "Exits", href: "/exit" }] : []),
        ],
    }
}

async function payroll(s: Session): Promise<Panel> {
    const { openPayrollMonth } = await import("@/lib/payroll-change-control")
    const ym = await openPayrollMonth().catch(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 } })
    const mName = new Date(ym.year, ym.month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" })
    const [byStatus, noSalary] = await Promise.all([
        prisma.payroll.groupBy({ by: ["status"], where: { month: ym.month, year: ym.year }, _count: { _all: true } }).catch(() => [] as any[]),
        prisma.employee.count({ where: { status: "ACTIVE", employeeSalary: null } }).catch(() => 0),
    ])
    const n = (st: string) => (byStatus as any[]).find(r => r.status === st)?._count._all ?? 0
    let challansDue = 0, nextDue: string | null = null
    try {
        const { monthRegister } = await import("@/lib/challans")
        const prev = ym.month === 1 ? { m: 12, y: ym.year - 1 } : { m: ym.month - 1, y: ym.year }
        const reg = await monthRegister(prev.m, prev.y)
        const open = reg.rows.filter((r: any) => r.status === "DUE" || r.status === "OVERDUE" || r.status === "PART_PAID")
        challansDue = open.length
        nextDue = open.map((r: any) => r.dueDate).sort()[0] ?? null
    } catch { /* challans not set up */ }
    return {
        key: "payroll", title: `Payroll — ${mName}`, subtitle: "The open payroll month",
        stats: [
            { label: "Draft rows", value: n("DRAFT"), href: "/payroll", tone: n("DRAFT") ? "amber" : "grey" },
            { label: "Locked / processed", value: n("PROCESSED"), href: "/payroll", tone: "blue" },
            { label: "Paid", value: n("PAID"), href: "/payroll", tone: "green" },
            { label: "Active without salary structure", value: noSalary, href: "/payroll/salary-master", tone: noSalary ? "red" : "grey" },
            { label: "Challans open (last month)", value: challansDue, href: "/payroll/challans", tone: challansDue ? "red" : "grey" },
        ],
        list: nextDue ? [{ title: new Date(nextDue) < new Date() ? "Challan overdue since" : "Next challan due", sub: new Date(nextDue).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), href: "/payroll/challans" }] : undefined,
        actions: [
            { label: "Open payroll", href: "/payroll", primary: true },
            { label: "Salary master", href: "/payroll/salary-master" },
            { label: "Challans", href: "/payroll/challans" },
            { label: "Arrears", href: "/payroll/arrears" },
        ],
    }
}

async function approvals(s: Session): Promise<Panel> {
    const stats: Stat[] = []
    if (can(s, "leaves.approve")) stats.push({ label: "Leaves to approve", value: await prisma.leave.count({ where: { status: "PENDING" as any } }).catch(() => 0), href: "/leaves", tone: "amber" })
    if (can(s, "expenses.approve")) stats.push({ label: "Expense claims to approve", value: await prisma.expense.count({ where: { status: "SUBMITTED" as any } }).catch(() => 0), href: "/expenses", tone: "amber" })
    if (can(s, "assets.approve")) stats.push({ label: "Asset requests", value: await prisma.assetRequest.count({ where: { status: "SUBMITTED" } }).catch(() => 0), href: "/assets", tone: "amber" })
    for (const st of stats) if (!st.value) st.tone = "grey"
    return {
        key: "approvals", title: "Waiting for my approval", stats,
        actions: [
            ...(can(s, "leaves.approve") ? [{ label: "Leaves", href: "/leaves", primary: true }] : []),
            ...(can(s, "expenses.approve") ? [{ label: "Expenses", href: "/expenses" }] : []),
            ...(can(s, "assets.approve") ? [{ label: "Assets", href: "/assets" }] : []),
        ],
    }
}

async function inspectionReview(s: Session): Promise<Panel> {
    const today = istToday()
    const [pending, oldest, approvedToday, active] = await Promise.all([
        prisma.inspection.count({ where: { status: "pending" } }),
        prisma.inspection.findFirst({ where: { status: "pending" }, orderBy: { submittedAt: "asc" }, select: { submittedAt: true } }),
        prisma.inspection.count({ where: { status: "approved", approvedAt: { gte: today } } }),
        prisma.assignment.count({ where: { status: "active" } }),
    ])
    const hours = oldest?.submittedAt ? Math.round((Date.now() - oldest.submittedAt.getTime()) / 3_600_000) : 0
    return {
        key: "inspectionReview", title: "Inspection reviews",
        stats: [
            { label: "Reports to review", value: pending, href: "/approvals", tone: pending ? "amber" : "grey" },
            { label: "Oldest waiting", value: pending ? (hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} h`) : "—", href: "/approvals", tone: hours >= 24 ? "red" : "grey" },
            { label: "Approved today", value: approvedToday, tone: "green" },
            { label: "Active assignments", value: active, href: "/assignments", tone: "blue" },
        ],
        actions: [
            { label: "Review reports", href: "/approvals", primary: true },
            ...(can(s, "assignments.create") ? [{ label: "New assignment", href: "/assignments" }] : []),
            ...(can(s, "projects.view") ? [{ label: "Projects", href: "/projects" }] : []),
        ],
    }
}

const BUILD: Record<PanelKey, (s: Session) => Promise<Panel>> = { inspector, recruiter, hr, payroll, approvals, inspectionReview }

export async function buildPanels(s: Session): Promise<Panel[]> {
    const keys = await panelsFor(s)
    const out = (await Promise.all(keys.map(k => BUILD[k](s).catch(e => { console.error("[DASH_PANEL]", k, e); return null })))).filter((p): p is Panel => !!p && p.stats.length > 0)
    // The inspector panel only for people who actually inspect (or have nothing else).
    const idle = (p: Panel) => p.key === "inspector" && p.stats.every(st => !st.value)
    return out.length > 1 ? out.filter(p => !idle(p)) : out
}
