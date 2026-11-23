import prisma from "@/lib/prisma"
import { notifyApprovers } from "@/lib/hr-notify"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"
import { getLmsSettings, type LmsSettings } from "@/lib/lms-settings"

// LMS automation: enrol people by the course assignment rules, re-enrol
// before a certificate expires, remind learners and escalate overdue training.
// Runs nightly (/api/cron/lms-daily) and right after employee changes.

const DAY = 86_400_000
const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })

type Emp = {
    id: string; designation: string | null; branchId: string | null
    department: { name: string } | null
    deployments: { siteId: string; site: { clientName: string | null } | null }[]
}
type Rule = { courseId: string; assignTo: string; value: string; dueDays: number | null }

/** Same matching as the original per-employee auto-assign. */
export function ruleMatches(rule: Rule, e: Emp): boolean {
    const v = rule.value.trim().toLowerCase()
    switch (rule.assignTo) {
        case "ALL": return true
        case "ROLE": return !!e.department?.name?.toLowerCase().includes(v)
        case "DESIGNATION": return !!e.designation?.toLowerCase().includes(v)
        case "SITE": return e.deployments.some(d => d.siteId === rule.value)
        case "CLIENT": return e.deployments.some(d => !!d.site?.clientName?.toLowerCase().includes(v))
        case "BRANCH": return e.branchId === rule.value
        default: return false
    }
}

/**
 * Enrol employees (all active staff, or only these) in every PUBLISHED course
 * whose active rules match them. Never re-enrols. Returns enrolments created
 * per employee id so the caller can tell them.
 */
export async function assignByRules(employeeIds: string[] | null, opts: { enrolledBy?: string | null; settings?: LmsSettings } = {}) {
    const s = opts.settings ?? await getLmsSettings()
    const rules: Rule[] = await prisma.courseAssignmentRule.findMany({
        where: { isActive: true, course: { status: "PUBLISHED" } },
        select: { courseId: true, assignTo: true, value: true, dueDays: true },
    })
    const created = new Map<string, string[]>()
    if (!rules.length) return { created, total: 0 }
    const employees: Emp[] = await prisma.employee.findMany({
        where: {
            status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] },
            ...(employeeIds ? { id: { in: employeeIds } } : {}),
        },
        select: {
            id: true, designation: true, branchId: true,
            department: { select: { name: true } },
            deployments: { where: { isActive: true }, select: { siteId: true, site: { select: { clientName: true } } } },
        },
    })
    if (!employees.length) return { created, total: 0 }
    const existing = await prisma.courseEnrollment.findMany({
        where: { employeeId: { in: employees.map(e => e.id) }, courseId: { in: Array.from(new Set(rules.map(r => r.courseId))) } },
        select: { employeeId: true, courseId: true },
    })
    const have = new Set(existing.map(x => `${x.employeeId}|${x.courseId}`))
    const rows: { courseId: string; employeeId: string; enrolledBy: string | null; dueDate: Date }[] = []
    for (const e of employees) {
        const due = new Map<string, number>()
        for (const r of rules) {
            if (have.has(`${e.id}|${r.courseId}`) || !ruleMatches(r, e)) continue
            const days = r.dueDays ?? s.defaults.dueDays
            due.set(r.courseId, Math.min(due.get(r.courseId) ?? Infinity, days))
        }
        for (const [courseId, days] of Array.from(due)) {
            rows.push({ courseId, employeeId: e.id, enrolledBy: opts.enrolledBy ?? null, dueDate: new Date(Date.now() + days * DAY) })
            created.set(e.id, [...(created.get(e.id) ?? []), courseId])
        }
    }
    let total = 0
    for (let i = 0; i < rows.length; i += 1000) total += (await prisma.courseEnrollment.createMany({ data: rows.slice(i, i + 1000), skipDuplicates: true })).count
    // Tell each person once, in-app (WhatsApp / email come from the reminders).
    if (total) {
        const courses = await prisma.course.findMany({ where: { id: { in: Array.from(new Set(rows.map(r => r.courseId))) } }, select: { id: true, title: true } })
        const title = new Map(courses.map(c => [c.id, c.title]))
        const users = await prisma.employee.findMany({ where: { id: { in: Array.from(created.keys()) }, userId: { not: null } }, select: { id: true, userId: true } })
        const notes = users.map(u => {
            const list = (created.get(u.id) ?? []).map(id => title.get(id)).filter(Boolean)
            return { userId: u.userId!, type: "lms", title: list.length === 1 ? "New training assigned" : `${list.length} trainings assigned`, message: `Please complete: ${list.join(", ")}.`, link: "/lms/learn" }
        })
        for (let i = 0; i < notes.length; i += 1000) await prisma.notification.createMany({ data: notes.slice(i, i + 1000) }).catch(() => {})
    }
    return { created, total }
}

/** Best effort, for employee create / edit / deployment hooks. Never throws. */
export async function assignAfterEmployeeChange(employeeIds: string[], enrolledBy?: string | null): Promise<void> {
    try {
        const s = await getLmsSettings()
        if (!s.autoAssign.onChange || !employeeIds.length) return
        await assignByRules(employeeIds, { enrolledBy, settings: s })
    } catch (e) {
        console.error("[LMS_ASSIGN_ON_CHANGE]", e)
    }
}

/** Re-enrol people whose certificate (course validity) runs out within the window. */
export async function renewExpiring(s: LmsSettings, now = new Date()): Promise<number> {
    if (!s.retraining.enabled) return 0
    const rows = await prisma.courseEnrollment.findMany({
        where: { status: "COMPLETED", completedAt: { not: null }, course: { validityDays: { not: null }, status: "PUBLISHED" } },
        select: { id: true, completedAt: true, employeeId: true, course: { select: { title: true, validityDays: true } }, employee: { select: { userId: true } } },
    })
    let n = 0
    for (const r of rows) {
        const expiry = new Date(r.completedAt!.getTime() + (r.course.validityDays ?? 0) * DAY)
        if (expiry.getTime() - s.retraining.beforeDays * DAY > now.getTime()) continue
        const due = new Date(Math.max(expiry.getTime(), now.getTime() + s.defaults.dueDays * DAY))
        const done = await prisma.courseEnrollment.updateMany({
            where: { id: r.id, status: "COMPLETED" },
            // enrolledAt restarts the cycle, so quiz attempts are counted afresh.
            data: { status: "ENROLLED", progress: 0, startedAt: null, completedAt: null, score: null, attempts: 0, enrolledAt: now, dueDate: due },
        })
        if (!done.count) continue
        n++
        if (r.employee.userId) {
            await prisma.notification.create({ data: { userId: r.employee.userId, type: "lms", title: "Refresher training due", message: `Your "${r.course.title}" certificate expires on ${fmt(expiry)}. Please complete the refresher by ${fmt(due)}.`, link: "/lms/learn" } }).catch(() => {})
        }
    }
    return n
}

/** The nightly LMS job. */
export async function runLmsDaily(now = new Date()) {
    const s = await getLmsSettings()
    const out = { assigned: 0, renewed: 0, dueReminders: 0, overdueReminders: 0, escalated: 0 }
    if (s.autoAssign.nightly) out.assigned = (await assignByRules(null, { settings: s })).total
    out.renewed = await renewExpiring(s, now)

    const open = await prisma.courseEnrollment.findMany({
        where: { status: { in: ["ENROLLED", "IN_PROGRESS"] }, dueDate: { not: null }, course: { status: "PUBLISHED" }, employee: { status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] } } },
        select: {
            id: true, dueDate: true, employeeId: true, course: { select: { title: true } },
            employee: { select: { firstName: true, lastName: true, userId: true, managerId: true } },
        },
    })
    const dayDiff = (d: Date) => Math.round((d.getTime() - now.getTime()) / DAY)
    const learnerNotes: { userId: string; type: string; title: string; message: string; link: string }[] = []
    const waDue: { employeeId: string; course: string; dueDate: string; status: string }[] = []
    const late: typeof open = []
    for (const e of open) {
        const left = Math.ceil((e.dueDate!.getTime() - now.getTime()) / DAY)
        if (left >= 0) {
            if (s.reminders.beforeDays > 0 && (left === s.reminders.beforeDays || left === 1)) {
                if (e.employee.userId) learnerNotes.push({ userId: e.employee.userId, type: "lms", title: "Training due soon", message: `"${e.course.title}" is due on ${fmt(e.dueDate!)}.`, link: "/lms/learn" })
                waDue.push({ employeeId: e.employeeId, course: e.course.title, dueDate: fmt(e.dueDate!), status: `due in ${left} day${left === 1 ? "" : "s"}` })
                out.dueReminders++
            }
        } else {
            const overdue = -dayDiff(e.dueDate!)
            if (s.reminders.overdueEveryDays > 0 && overdue > 0 && overdue % s.reminders.overdueEveryDays === 0) {
                if (e.employee.userId) learnerNotes.push({ userId: e.employee.userId, type: "lms", title: "Training overdue", message: `"${e.course.title}" was due on ${fmt(e.dueDate!)}. Please complete it now.`, link: "/lms/learn" })
                waDue.push({ employeeId: e.employeeId, course: e.course.title, dueDate: fmt(e.dueDate!), status: `overdue by ${overdue} day${overdue === 1 ? "" : "s"}` })
                out.overdueReminders++
            }
            if (s.reminders.escalateAfterDays > 0 && overdue >= s.reminders.escalateAfterDays) late.push(e)
        }
    }
    for (let i = 0; i < learnerNotes.length; i += 1000) await prisma.notification.createMany({ data: learnerNotes.slice(i, i + 1000) }).catch(() => {})
    // WhatsApp / email through the Communication Center (event "training_due", off until HR switches it on).
    if (waDue.length) {
        try {
            const { commNotify, employeeRecipients } = await import("@/lib/comm/recipients")
            const per = new Map(waDue.map(w => [w.employeeId, { course: w.course, dueDate: w.dueDate, status: w.status }]))
            await commNotify("training_due", employeeRecipients(Array.from(per.keys()), per), {}, { refType: "LmsDaily", refId: now.toISOString().slice(0, 10) })
        } catch (e) { console.error("[LMS_DAILY_COMM]", e) }
    }

    // Escalation: one summary to HR and/or one per manager.
    if (late.length) {
        const line = (list: typeof late) => {
            const names = list.slice(0, 8).map(e => `${`${e.employee.firstName} ${e.employee.lastName ?? ""}`.trim()} (${e.course.title})`)
            return names.join(", ") + (list.length > 8 ? ` and ${list.length - 8} more` : "")
        }
        if (s.reminders.escalateTo !== "manager") {
            await notifyApprovers(["lms.enroll"], { title: `${late.length} trainings overdue ${s.reminders.escalateAfterDays}+ days`, message: line(late), type: "lms", link: "/lms" })
        }
        if (s.reminders.escalateTo !== "hr") {
            const byMgr = new Map<string, typeof late>()
            for (const e of late) if (e.employee.managerId) byMgr.set(e.employee.managerId, [...(byMgr.get(e.employee.managerId) ?? []), e])
            const active = new Set((await prisma.user.findMany({ where: { id: { in: Array.from(byMgr.keys()) }, isActive: true }, select: { id: true } })).map(u => u.id))
            for (const [mid, list] of Array.from(byMgr)) {
                if (!active.has(mid)) continue
                await prisma.notification.create({ data: { userId: mid, type: "lms", title: `${list.length} of your team overdue on training`, message: line(list), link: "/lms" } }).catch(() => {})
            }
        }
        out.escalated = late.length
    }
    return out
}
