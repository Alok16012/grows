import prisma from "@/lib/prisma"
import { notifyApprovers, notifyEmployee } from "@/lib/hr-notify"
import { UNASSIGNABLE_EMPLOYEE_STATUSES } from "@/lib/employee-filter"
import { addDays, dayKey, istDay, periodFor, periodLabel, type Period } from "@/lib/perf-hub"
import { publishedByFamily, notifyUser, logActivity } from "@/lib/perf-hub-db"
import { getDwmSettings, graceDays, dueDay, type DwmSettings } from "@/lib/dwm-settings"

// Daily DWM job (cron 9:00 IST + "Run now" in DWM Settings):
//  1. remind employees about reports still within their grace days
//  2. tell each reviewer who missed a deadline that passed yesterday
//  3. remind reviewers about reports waiting longer than the target
//  4. escalate very old ones to HR, and optionally auto-approve clean ones
// All limits come from DWM Settings.

const DONE = ["SUBMITTED", "APPROVED"]
const FREQ_WORD: Record<string, string> = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" }
const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })

/** Ended periods that are still on time today (the grace window). */
export function openPeriods(s: DwmSettings, frequency: string, today: Date): Period[] {
    const out = new Map<string, Period>()
    for (let k = 1; k <= graceDays(s, frequency) + 1; k++) {
        const p = periodFor(frequency, addDays(today, -k), true)
        if (p.end.getTime() < today.getTime() && dueDay(s, frequency, p.end).getTime() >= today.getTime()) out.set(dayKey(p.start), p)
    }
    return Array.from(out.values())
}

/** The period whose deadline was yesterday, if one ends on the right day. */
export function justMissed(s: DwmSettings, frequency: string, today: Date): Period | null {
    const lastDay = addDays(today, -1 - graceDays(s, frequency))
    const p = periodFor(frequency, lastDay, true)
    return p.end.getTime() === lastDay.getTime() ? p : null
}

/** Daily reports aren't expected on Sundays (same rule as compliance). */
const expected = (frequency: string, p: Period) => frequency !== "DAILY" || p.start.getUTCDay() !== 0

export async function runDwmDaily(now = new Date()) {
    const s = await getDwmSettings()
    const today = istDay(now)
    const res = { employeeReminders: 0, missed: 0, missedLists: 0, reviewReminders: 0, escalated: 0, autoApproved: 0 }

    // ── Who reports on what ────────────────────────────────────────────────
    const assignments = await prisma.perfAssignment.findMany({
        where: { employee: { status: { notIn: [...UNASSIGNABLE_EMPLOYEE_STATUSES] } } },
        select: {
            employeeId: true, reviewerUserId: true, effectiveFrom: true, templateFamilyId: true,
            employee: { select: { firstName: true, lastName: true } },
        },
    })
    const live = await publishedByFamily(Array.from(new Set(assignments.map(a => a.templateFamilyId))))
    const freqRows = live.size
        ? await prisma.perfTemplateKpi.groupBy({ by: ["templateId", "frequency"], where: { templateId: { in: Array.from(live.values()).map(t => t.id) } } })
        : []
    const freqsOf = new Map<string, string[]>()
    for (const r of freqRows) freqsOf.set(r.templateId, [...(freqsOf.get(r.templateId) ?? []), r.frequency])

    type Due = { employeeId: string; frequency: string; period: Period }
    const remind: Due[] = [], missed: Due[] = []
    for (const a of assignments) {
        const t = live.get(a.templateFamilyId)
        if (!t) continue
        for (const f of freqsOf.get(t.id) ?? []) {
            const after = (p: Period) => p.start.getTime() >= a.effectiveFrom.getTime() && expected(f, p)
            if (s.reminders.employee) for (const p of openPeriods(s, f, today)) if (after(p)) remind.push({ employeeId: a.employeeId, frequency: f, period: p })
            const m = justMissed(s, f, today)
            if (s.reminders.reviewerMissedList && m && after(m)) missed.push({ employeeId: a.employeeId, frequency: f, period: m })
        }
    }

    // Which of those are already filed.
    const candidates = [...remind, ...missed]
    const filed = new Set<string>()
    if (candidates.length) {
        const rows = await prisma.perfReport.findMany({
            where: {
                employeeId: { in: Array.from(new Set(candidates.map(c => c.employeeId))) },
                periodStart: { in: Array.from(new Set(candidates.map(c => c.period.start.getTime()))).map(t => new Date(t)) },
                status: { in: DONE },
            },
            select: { employeeId: true, frequency: true, periodStart: true },
        })
        for (const r of rows) filed.add(`${r.employeeId}|${r.frequency}|${dayKey(r.periodStart)}`)
    }
    const open = (d: Due) => !filed.has(`${d.employeeId}|${d.frequency}|${dayKey(d.period.start)}`)

    // 1. Employee reminders — one notification per person.
    const byEmp = new Map<string, Due[]>()
    for (const d of remind.filter(open)) byEmp.set(d.employeeId, [...(byEmp.get(d.employeeId) ?? []), d])
    for (const [employeeId, list] of Array.from(byEmp)) {
        const items = list.map(d => `${FREQ_WORD[d.frequency]} report for ${periodLabel(d.frequency, d.period.start)} (due ${fmt(dueDay(s, d.frequency, d.period.end))})`)
        await notifyEmployee(employeeId, {
            title: list.length === 1 ? "KPI report due" : `${list.length} KPI reports due`,
            message: `Please fill and submit your ${items.join("; ")}.`,
            type: "performance",
            link: "/performance/hub/reports",
        })
        res.employeeReminders++
    }

    // 2. Missed deadlines — one list per reviewer (HR when there's no reviewer).
    const nameOf = new Map(assignments.map(a => [a.employeeId, `${a.employee.firstName} ${a.employee.lastName ?? ""}`.trim()]))
    const reviewerOf = new Map(assignments.map(a => [a.employeeId, a.reviewerUserId]))
    const byReviewer = new Map<string, Due[]>()
    for (const d of missed.filter(open)) {
        const k = reviewerOf.get(d.employeeId) ?? "__hr__"
        byReviewer.set(k, [...(byReviewer.get(k) ?? []), d])
    }
    res.missed = missed.filter(open).length
    for (const [rid, list] of Array.from(byReviewer)) {
        const names = Array.from(new Set(list.map(d => nameOf.get(d.employeeId) ?? "—")))
        const shown = names.slice(0, 8).join(", ") + (names.length > 8 ? ` and ${names.length - 8} more` : "")
        const note = {
            title: `${names.length} missed the KPI report deadline`,
            message: `Not submitted by the deadline (yesterday): ${shown}.`,
            link: "/performance/hub/team",
        }
        if (rid === "__hr__") await notifyApprovers(["performance.edit"], { ...note, type: "performance" })
        else await notifyUser(rid, note)
        res.missedLists++
    }

    // 3–5. Submitted reports waiting for review.
    const waiting = await prisma.perfReport.findMany({
        where: { status: "SUBMITTED", submittedAt: { not: null } },
        select: {
            id: true, frequency: true, periodStart: true, submittedAt: true, employeeId: true,
            employee: { select: { firstName: true, lastName: true, perfAssignment: { select: { reviewerUserId: true } } } },
            values: { where: { rag: "RED" }, select: { id: true }, take: 1 },
        },
    })
    const ageDays = (d: Date) => (now.getTime() - d.getTime()) / 86_400_000
    const remindReviewer = new Map<string, number>()
    let escalate = 0
    for (const r of waiting) {
        const age = ageDays(r.submittedAt!)
        if (s.review.autoApproveAfterDays > 0 && age >= s.review.autoApproveAfterDays && r.values.length === 0) {
            const done = await prisma.perfReport.updateMany({
                where: { id: r.id, status: "SUBMITTED" },
                data: { status: "APPROVED", decidedBy: "system", decidedAt: now, decisionNote: `Approved automatically after ${s.review.autoApproveAfterDays} days with no RED KPI` },
            })
            if (done.count) {
                await logActivity(r.id, "APPROVED", "system", "Auto-approved (DWM Settings)")
                await notifyEmployee(r.employeeId, {
                    title: "KPI report approved",
                    message: `Your ${FREQ_WORD[r.frequency]} KPI report for ${periodLabel(r.frequency, r.periodStart)} was approved automatically.`,
                    type: "performance", link: `/performance/hub/reports/${r.id}`,
                })
                res.autoApproved++
            }
            continue
        }
        if (s.review.escalateAfterDays > 0 && age >= s.review.escalateAfterDays) escalate++
        else if (s.review.targetDays > 0 && age >= s.review.targetDays) {
            const k = r.employee.perfAssignment?.reviewerUserId ?? "__hr__"
            remindReviewer.set(k, (remindReviewer.get(k) ?? 0) + 1)
        }
    }
    for (const [rid, n] of Array.from(remindReviewer)) {
        const note = {
            title: `${n} KPI report${n === 1 ? "" : "s"} waiting for your review`,
            message: `Waiting more than ${s.review.targetDays} day${s.review.targetDays === 1 ? "" : "s"}. Open the Review Queue to approve or return them.`,
            link: "/performance/hub/review",
        }
        if (rid === "__hr__") await notifyApprovers(["performance.edit"], { ...note, type: "performance" })
        else await notifyUser(rid, note)
        res.reviewReminders += n
    }
    if (escalate) {
        await notifyApprovers(["performance.edit"], {
            title: `${escalate} KPI report${escalate === 1 ? "" : "s"} not reviewed for ${s.review.escalateAfterDays}+ days`,
            message: "These reports are past the escalation limit in DWM Settings. Review them or change the reviewer.",
            type: "performance", link: "/performance/hub/review",
        })
        res.escalated = escalate
    }
    return res
}
