import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { notifyApprovers, notifyEmployee } from "@/lib/hr-notify"
import { periodLabel } from "@/lib/perf-hub"
import {
    perfCtx, perfErrorResponse, jsonError, reportDetail, refreshAutoValues, recomputeReport,
    logActivity, notifyUser, PerfHubError, type PerfCtx,
} from "@/lib/perf-hub-db"

type Params = { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        return NextResponse.json({ report: await reportDetail(params.id, ctx) })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_REPORT_GET]")
    }
}

const EDITABLE = ["DRAFT", "RETURNED"]

async function loadForAction(ctx: PerfCtx, id: string) {
    const r = await prisma.perfReport.findUnique({
        where: { id },
        include: {
            employee: { select: { id: true, userId: true, firstName: true, lastName: true, perfAssignment: { select: { reviewerUserId: true } } } },
        },
    })
    if (!r) throw new PerfHubError(404, "Report not found")
    const isOwner = !!r.employee.userId && r.employee.userId === ctx.userId
    const isReviewer = r.employee.perfAssignment?.reviewerUserId === ctx.userId
    if (!isOwner && !isReviewer && !ctx.canView) throw new PerfHubError(403, "Forbidden")
    return { r, isOwner, isReviewer }
}

function assertEditable(ctx: PerfCtx, status: string, isOwner: boolean) {
    if (!isOwner && !ctx.isManager) throw new PerfHubError(403, "Only the employee can fill this report")
    if (!EDITABLE.includes(status)) throw new PerfHubError(409, `This report is ${status.toLowerCase()} and can't be changed`)
}

/** A typed-in actual: blank → null; yes/no → 1/0; counts and % can't go negative. */
function parseActual(raw: unknown, valueType: string, name: string): number | null {
    if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return null
    if (valueType === "YESNO") {
        const s = String(raw).trim().toLowerCase()
        if (raw === true || s === "yes" || s === "true" || s === "1") return 1
        if (raw === false || s === "no" || s === "false" || s === "0") return 0
        throw new PerfHubError(400, `"${name}" must be yes or no`)
    }
    const n = typeof raw === "number" ? raw : Number(String(raw).trim())
    if (!Number.isFinite(n)) throw new PerfHubError(400, `"${name}" must be a number`)
    if ((valueType === "COUNT" || valueType === "PERCENT") && n < 0) throw new PerfHubError(400, `"${name}" can't be negative`)
    return n
}

const optText = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

type ValueInput = { kpiId?: string; actual?: unknown; remark?: unknown; evidenceUrl?: unknown }

async function saveValues(reportId: string, templateId: string, frequency: string, input: ValueInput[]) {
    const kpis = await prisma.perfTemplateKpi.findMany({ where: { templateId, frequency } })
    const kpiById = new Map(kpis.map(k => [k.id, k]))
    const rows = await prisma.perfReportValue.findMany({ where: { reportId } })
    const rowBy = new Map(rows.map(v => [v.kpiId, v]))

    const writes: { kpiId: string; data: { actual?: number | null; isAuto?: boolean; remark?: string | null; evidenceUrl?: string | null } }[] = []
    for (const v of input) {
        const kpi = kpiById.get(String(v?.kpiId ?? ""))
        if (!kpi) throw new PerfHubError(400, "A value was sent for a KPI that isn't on this report")
        const row = rowBy.get(kpi.id)
        const data: (typeof writes)[number]["data"] = {}
        // A computed AUTO value wins; manual entry is only a fallback when
        // the system couldn't produce one.
        if ("actual" in v && !(row?.isAuto && row.actual !== null)) {
            data.actual = parseActual(v.actual, kpi.valueType, kpi.name)
            data.isAuto = false
        }
        if ("remark" in v) data.remark = optText(v.remark, 2000)
        if ("evidenceUrl" in v) data.evidenceUrl = optText(v.evidenceUrl, 1000)
        if (Object.keys(data).length) writes.push({ kpiId: kpi.id, data })
    }
    await prisma.$transaction(writes.map(w => prisma.perfReportValue.upsert({
        where: { reportId_kpiId: { reportId, kpiId: w.kpiId } },
        create: { reportId, kpiId: w.kpiId, ...w.data },
        update: w.data,
    })))
}

/** What still blocks submission, by KPI name. */
async function submitProblems(reportId: string, templateId: string, frequency: string) {
    const [kpis, values] = await Promise.all([
        prisma.perfTemplateKpi.findMany({ where: { templateId, frequency }, orderBy: [{ kra: { sortOrder: "asc" } }, { sortOrder: "asc" }] }),
        prisma.perfReportValue.findMany({ where: { reportId } }),
    ])
    const valueOf = new Map(values.map(v => [v.kpiId, v]))
    const missing = kpis.filter(k => valueOf.get(k.id)?.actual == null)
    const needRemark = kpis.filter(k => valueOf.get(k.id)?.rag === "RED" && !valueOf.get(k.id)?.remark)
    const needEvidence = kpis.filter(k => k.evidenceRequired && !valueOf.get(k.id)?.evidenceUrl)
    const parts: string[] = []
    const names = (l: typeof kpis) => l.map(k => k.name).join(", ")
    if (missing.length) parts.push(`Enter a value for: ${names(missing)}`)
    if (needRemark.length) parts.push(`Add a remark / action plan for: ${names(needRemark)}`)
    if (needEvidence.length) parts.push(`Attach evidence for: ${names(needEvidence)}`)
    return {
        error: parts.length ? parts.join(". ") : null,
        missing: missing.map(k => k.id), needRemark: needRemark.map(k => k.id), needEvidence: needEvidence.map(k => k.id),
    }
}

/** Status change guarded on the current status, so two reviewers can't both act. */
async function transition(id: string, from: string[], data: Record<string, unknown>) {
    const res = await prisma.perfReport.updateMany({ where: { id, status: { in: from } }, data })
    if (res.count === 0) throw new PerfHubError(409, "This report changed in the meantime — reload and try again")
}

// PATCH — SAVE | REFRESH_AUTO | SUBMIT | APPROVE | RETURN.
export async function PATCH(req: Request, { params }: Params) {
    try {
        const ctx = await perfCtx(req)
        const body = await req.json().catch(() => ({}))
        const action = body?.action
        const { r, isOwner, isReviewer } = await loadForAction(ctx, params.id)
        const who = `${r.employee.firstName} ${r.employee.lastName}`.trim()
        const label = periodLabel(r.frequency, r.periodStart)

        switch (action) {
            case "SAVE": {
                assertEditable(ctx, r.status, isOwner)
                const values: ValueInput[] = Array.isArray(body?.values) ? body.values : []
                await saveValues(r.id, r.templateId, r.frequency, values)
                await recomputeReport(r.id)
                await logActivity(r.id, "SAVED", ctx.userId)
                break
            }
            case "REFRESH_AUTO": {
                assertEditable(ctx, r.status, isOwner)
                await refreshAutoValues(r.id)
                await recomputeReport(r.id)
                await logActivity(r.id, "AUTO_REFRESHED", ctx.userId)
                break
            }
            case "SUBMIT": {
                assertEditable(ctx, r.status, isOwner)
                // Values sent with the submit are saved first, and AUTO values
                // are re-read so the reviewer sees current system numbers.
                if (Array.isArray(body?.values) && body.values.length) await saveValues(r.id, r.templateId, r.frequency, body.values)
                await refreshAutoValues(r.id)
                await recomputeReport(r.id)
                const problems = await submitProblems(r.id, r.templateId, r.frequency)
                if (problems.error) return NextResponse.json(problems, { status: 400 })

                await transition(r.id, EDITABLE, { status: "SUBMITTED", submittedAt: new Date() })
                await logActivity(r.id, "SUBMITTED", ctx.userId, optText(body?.note, 1000))
                const note = {
                    title: "KPI report submitted",
                    message: `${who} submitted the ${r.frequency.toLowerCase()} KPI report for ${label}`,
                    link: `/performance/hub/review?id=${r.id}`,
                }
                const reviewerId = r.employee.perfAssignment?.reviewerUserId
                if (reviewerId) await notifyUser(reviewerId, note)
                else await notifyApprovers(["performance.manage"], { ...note, type: "performance" }, ctx.userId)
                break
            }
            case "APPROVE":
            case "RETURN": {
                if (isOwner) return jsonError(403, "You can't review your own report")
                if (!isReviewer && !ctx.isManager) return jsonError(403, "Only the reviewer or HR can review this report")
                if (r.status !== "SUBMITTED") return jsonError(409, "Only a submitted report can be reviewed")
                const note = optText(body?.note, 2000)
                if (action === "RETURN" && !note) return jsonError(400, "Add a note saying what to fix")
                const status = action === "APPROVE" ? "APPROVED" : "RETURNED"
                await transition(r.id, ["SUBMITTED"], { status, decidedBy: ctx.userId, decidedAt: new Date(), decisionNote: note })
                await logActivity(r.id, status, ctx.userId, note)
                await notifyEmployee(r.employee.id, {
                    title: action === "APPROVE" ? "KPI report approved" : "KPI report returned",
                    message: action === "APPROVE"
                        ? `Your ${r.frequency.toLowerCase()} KPI report for ${label} was approved`
                        : `Your ${r.frequency.toLowerCase()} KPI report for ${label} was returned: ${note}`,
                    type: "performance",
                    link: `/performance/hub/reports/${r.id}`,
                })
                break
            }
            default:
                return jsonError(400, "action must be SAVE, REFRESH_AUTO, SUBMIT, APPROVE or RETURN")
        }
        return NextResponse.json({ report: await reportDetail(r.id, ctx) })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_REPORT_PATCH]")
    }
}
