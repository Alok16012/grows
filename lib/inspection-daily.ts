import prisma from "@/lib/prisma"
import { notifyApprovers } from "@/lib/hr-notify"
import { getInspectionSettings } from "@/lib/inspection-settings"
import { siteCustomerRecipients, reportFigures } from "@/lib/inspection-customers"
import { notify } from "@/lib/comm/engine"
import { istDateOnly } from "@/lib/attendance-policy"
import { isMissingTableErr } from "@/lib/asset-workflow"

// The inspection module's daily job (/api/cron/inspection-daily, or "Run now"
// on Approvals → Settings). Every limit comes from Inspection settings.
//   1. Overdue approvals: remind approvers; escalate long-overdue ones to admins.
//   2. Drafts: remind the inspector; optionally delete drafts with nothing in them.
//   3. Customer summary (daily / weekly) through the Communication Center —
//      sent once per customer per period, however often the job runs.

const H = 3_600_000
const fmtN = (n: number) => Math.round(n).toLocaleString("en-IN")

export async function runInspectionDaily(now = new Date(), opts: { createdBy?: string | null } = {}) {
    const s = await getInspectionSettings()
    const out = { overdue: 0, escalated: 0, draftReminders: 0, draftsDeleted: 0, summaries: 0, summaryMessages: 0, ncrOverdue: 0 }

    // ── 1. Overdue approvals ──────────────────────────────────────────────
    const overdue = await prisma.inspection.findMany({
        where: { status: "pending", submittedAt: { lt: new Date(now.getTime() - s.approval.targetHours * H) } },
        select: { id: true, submittedAt: true },
    })
    out.overdue = overdue.length
    if (overdue.length && s.approval.remindApprovers) {
        await notifyApprovers(["approvals.manage"], {
            title: `${overdue.length} inspection report${overdue.length === 1 ? "" : "s"} waiting over ${s.approval.targetHours} h`,
            message: `Reports submitted more than ${s.approval.targetHours} hours ago are still waiting for approval. Oldest: ${Math.floor((now.getTime() - Math.min(...overdue.map(o => o.submittedAt!.getTime()))) / H)} h.`,
            type: "approval_reminder", link: "/approvals?overdue=1",
        })
    }
    if (s.approval.escalateAfterHours > 0) {
        const late = overdue.filter(o => o.submittedAt!.getTime() < now.getTime() - s.approval.escalateAfterHours * H)
        out.escalated = late.length
        if (late.length) {
            const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
            if (admins.length) await prisma.notification.createMany({
                data: admins.map(a => ({
                    userId: a.id, type: "approval_escalation", link: "/approvals?overdue=1",
                    title: `Escalation: ${late.length} report${late.length === 1 ? "" : "s"} unapproved for over ${s.approval.escalateAfterHours} h`,
                    message: `${late.length} inspection report(s) have waited more than ${s.approval.escalateAfterHours} hours for approval.`,
                })),
            })
        }
    }

    // ── 2. Drafts ────────────────────────────────────────────────────────
    if (s.drafts.remindAfterDays > 0) {
        const old = await prisma.inspection.groupBy({
            by: ["submittedBy"], where: { status: "draft", createdAt: { lt: new Date(now.getTime() - s.drafts.remindAfterDays * 24 * H) } }, _count: true,
        })
        if (old.length) {
            await prisma.notification.createMany({
                data: old.map(o => ({
                    userId: o.submittedBy, type: "draft_reminder", link: "/inspection",
                    title: `${o._count} unfinished inspection report${o._count === 1 ? "" : "s"}`,
                    message: `You have ${o._count} draft report(s) older than ${s.drafts.remindAfterDays} day(s). Please complete and submit them.`,
                })),
            })
            out.draftReminders = old.length
        }
    }
    if (s.drafts.deleteEmptyAfterDays > 0) {
        const empty = await prisma.inspection.findMany({
            where: { status: "draft", paperFormPhoto: null, responses: { none: {} }, createdAt: { lt: new Date(now.getTime() - s.drafts.deleteEmptyAfterDays * 24 * H) } },
            select: { id: true },
        })
        if (empty.length) out.draftsDeleted = (await prisma.inspection.deleteMany({ where: { id: { in: empty.map(e => e.id) } } })).count
    }

    // ── 3. Customer summary ──────────────────────────────────────────────
    const today = istDateOnly(now)                      // IST midnight of today, as UTC midnight
    const due = s.summary.frequency === "daily" || (s.summary.frequency === "weekly" && today.getUTCDay() === s.summary.weekday)
    if (due) {
        const days = s.summary.frequency === "daily" ? 1 : 7
        const start = new Date(today.getTime() - days * 24 * H - 330 * 60_000)   // IST midnight, `days` ago
        const end = new Date(today.getTime() - 330 * 60_000)                      // IST midnight today
        const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
        const period = days === 1 ? fmt(start) : `${fmt(start)} – ${fmt(new Date(end.getTime() - 1))}`
        const periodKey = `${s.summary.frequency}:${start.toISOString().slice(0, 10)}`

        const reports = await prisma.inspection.findMany({
            where: { status: "approved", approvedAt: { gte: start, lt: end } },
            select: {
                assignment: { select: { project: { select: { siteId: true, site: { select: { name: true } } } } } },
                responses: { select: { value: true, field: { select: { fieldLabel: true, category: true, reportRole: true } } } },
            },
        })
        const bySite = new Map<string, { name: string; n: number; inspected: number; rework: number; rejected: number; defects: Map<string, number> }>()
        for (const r of reports) {
            const siteId = r.assignment.project.siteId
            if (!siteId) continue
            const f = reportFigures(r.responses)
            const g = bySite.get(siteId) ?? { name: r.assignment.project.site?.name ?? "", n: 0, inspected: 0, rework: 0, rejected: 0, defects: new Map() }
            g.n++; g.inspected += f.inspected; g.rework += f.rework; g.rejected += f.rejected
            for (const d of f.defects) g.defects.set(d.name, (g.defects.get(d.name) ?? 0) + d.qty)
            bySite.set(siteId, g)
        }
        for (const [siteId, g] of bySite) {
            const refId = `${siteId}:${periodKey}`
            try {
                if (await prisma.commMessage.count({ where: { refType: "CustomerSummary", refId } })) continue   // already sent for this period
            } catch (e) { if (!isMissingTableErr(e)) throw e; break }
            const recipients = await siteCustomerRecipients(siteId)
            if (!recipients.length) continue
            const top = Array.from(g.defects.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${fmtN(v)}`).join(", ") || "None"
            const ppm = g.inspected ? Math.round(g.rejected / g.inspected * 1_000_000) : 0
            const r = await notify("customer_summary", recipients, {
                site: g.name, period, reports: g.n, inspected: fmtN(g.inspected), rework: fmtN(g.rework), rejected: fmtN(g.rejected),
                ppm: fmtN(ppm), topDefects: top, summary: `${fmtN(g.inspected)} inspected · ${fmtN(g.rework)} rework · ${fmtN(g.rejected)} rejected`,
            }, { refType: "CustomerSummary", refId, createdBy: opts.createdBy ?? null, budgetMs: 2000 })
            out.summaries++
            out.summaryMessages += r.queued
        }
    }

    // ── NCRs past their due date: remind the owner every morning ───────────
    try {
        const late = await prisma.ncr.findMany({
            where: { status: { notIn: ["CLOSED", "CANCELLED"] }, dueDate: { lt: now }, ownerUserId: { not: null } },
            select: { id: true, code: true, title: true, ownerUserId: true, dueDate: true },
        })
        for (const n of late) {
            await prisma.notification.create({ data: { userId: n.ownerUserId!, type: "quality", title: `${n.code} is overdue`, message: `${n.title} — due ${n.dueDate!.toLocaleDateString("en-GB")}. Update the 8D steps or the due date.`, link: `/quality/ncr/${n.id}` } })
        }
        out.ncrOverdue = late.length
    } catch (e) { if (!isMissingTableErr(e)) throw e }
    return out
}
