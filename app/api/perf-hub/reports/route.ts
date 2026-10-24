import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { FREQUENCIES, REPORT_STATUSES, isOneOf, parseDay, istDay, periodFor } from "@/lib/perf-hub"
import {
    perfCtx, perfErrorResponse, jsonError, myEmployeeId, revieweeIds, publishedByFamily,
    refreshAutoValues, recomputeReport, logActivity, reportDetail, isUniqueErr, EMPLOYEE_SELECT,
} from "@/lib/perf-hub-db"

// GET — report lists. mine = my own; queue = what I review (everyone's for
// HR), never my own; all = team view (performance.view) or my reviewees.
export async function GET(req: Request) {
    try {
        const ctx = await perfCtx(req)
        const sp = new URL(req.url).searchParams
        const scope = sp.get("scope") || "mine"
        const and: Prisma.PerfReportWhereInput[] = []

        if (scope === "mine") {
            if (!ctx.employee) return NextResponse.json({ reports: [] })
            and.push({ employeeId: ctx.employee.id })
        } else if (scope === "queue") {
            // `reviewer` tells the hub nav to keep the Team tabs even when the
            // queue is empty — a reviewer still needs the Team Dashboard.
            if (!ctx.isManager) {
                const ids = await revieweeIds(ctx.userId)
                if (!ids.length) return NextResponse.json({ reports: [], reviewer: false })
                and.push({ employeeId: { in: ids } })
            }
            if (ctx.employee) and.push({ employeeId: { not: ctx.employee.id } })
        } else if (scope === "all") {
            if (!ctx.canView) {
                const ids = await revieweeIds(ctx.userId)
                if (!ids.length) return jsonError(403, "Forbidden")
                and.push({ employeeId: { in: ids } })
            }
        } else {
            return jsonError(400, "scope must be mine, queue or all")
        }

        const frequency = sp.get("frequency")
        if (frequency && frequency !== "ALL") {
            if (!isOneOf(FREQUENCIES, frequency)) return jsonError(400, "Unknown frequency")
            and.push({ frequency })
        }
        const status = sp.get("status")
        if (status && status !== "ALL") {
            const list = status.split(",").filter(s => isOneOf(REPORT_STATUSES, s))
            if (!list.length) return jsonError(400, "Unknown status")
            and.push({ status: { in: list } })
        }
        const employeeId = sp.get("employeeId")
        if (employeeId) and.push({ employeeId })
        const from = sp.get("from") ? parseDay(sp.get("from")) : null
        const to = sp.get("to") ? parseDay(sp.get("to")) : null
        if ((sp.get("from") && !from) || (sp.get("to") && !to)) return jsonError(400, "from / to must be YYYY-MM-DD")
        if (from) and.push({ periodStart: { gte: from } })
        if (to) and.push({ periodStart: { lte: to } })

        const reports = await prisma.perfReport.findMany({
            where: { AND: and },
            select: {
                id: true, frequency: true, periodStart: true, periodEnd: true, status: true, score: true,
                submittedAt: true, decidedAt: true, templateId: true, createdAt: true,
                employee: { select: EMPLOYEE_SELECT },
                template: { select: { id: true, name: true, version: true } },
            },
            orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
            take: 500,
        })
        const ids = reports.map(r => r.id)
        const templateIds = Array.from(new Set(reports.map(r => r.templateId)))
        const [kpiCounts, filled, red] = ids.length ? await Promise.all([
            prisma.perfTemplateKpi.groupBy({ by: ["templateId", "frequency"], where: { templateId: { in: templateIds } }, _count: { _all: true } }),
            prisma.perfReportValue.groupBy({ by: ["reportId"], where: { reportId: { in: ids }, actual: { not: null } }, _count: { _all: true } }),
            prisma.perfReportValue.groupBy({ by: ["reportId"], where: { reportId: { in: ids }, rag: "RED" }, _count: { _all: true } }),
        ]) : [[], [], []]
        const kpiTotal = new Map(kpiCounts.map(k => [`${k.templateId}|${k.frequency}`, k._count._all]))
        const filledBy = new Map(filled.map(f => [f.reportId, f._count._all]))
        const redBy = new Map(red.map(f => [f.reportId, f._count._all]))

        return NextResponse.json({
            ...(scope === "queue" ? { reviewer: true } : {}),
            reports: reports.map(({ templateId, ...r }) => ({
                ...r,
                kpiTotal: kpiTotal.get(`${templateId}|${r.frequency}`) ?? 0,
                kpiWithValues: filledBy.get(r.id) ?? 0,
                redCount: redBy.get(r.id) ?? 0,
            })),
        })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_REPORTS_GET]")
    }
}

// POST — open (or reuse) the report for one period, on the employee's live
// template version, with REGISTER / SYSTEM values filled in.
export async function POST(req: Request) {
    try {
        const ctx = await perfCtx(req)
        const body = await req.json().catch(() => ({}))
        const frequency = body?.frequency
        if (!isOneOf(FREQUENCIES, frequency)) return jsonError(400, "Frequency must be DAILY, WEEKLY or MONTHLY")

        let employeeId: string
        if (body?.employeeId && body.employeeId !== ctx.employee?.id) {
            if (!ctx.isManager) return jsonError(403, "Only HR can open a report for another employee")
            const emp = await prisma.employee.findUnique({ where: { id: String(body.employeeId) }, select: { id: true } })
            if (!emp) return jsonError(400, "Employee not found")
            employeeId = emp.id
        } else {
            if (!ctx.selfServe) return jsonError(403, "Forbidden")
            employeeId = myEmployeeId(ctx)
        }

        const day = body?.date ? parseDay(body.date) : istDay()
        if (!day) return jsonError(400, "Date must be YYYY-MM-DD")
        const period = periodFor(frequency, day, true)
        if (period.start.getTime() > istDay().getTime()) return jsonError(400, "Can't open a report for a future period")

        const key = { employeeId_frequency_periodStart: { employeeId, frequency, periodStart: period.start } }
        const existing = await prisma.perfReport.findUnique({ where: key, select: { id: true } })
        if (existing) return NextResponse.json({ report: await reportDetail(existing.id, ctx), created: false })

        const assignment = await prisma.perfAssignment.findUnique({ where: { employeeId } })
        if (!assignment) return jsonError(400, "No KPI template assigned — ask HR to assign one in People & Roles")
        const template = (await publishedByFamily([assignment.templateFamilyId])).get(assignment.templateFamilyId)
        if (!template) return jsonError(400, "Your KPI template isn't published yet — ask HR to publish it")
        const kpiCount = await prisma.perfTemplateKpi.count({ where: { templateId: template.id, frequency } })
        if (!kpiCount) return jsonError(400, `Your KPI template has no ${frequency.toLowerCase()} KPIs`)

        let reportId: string
        try {
            const r = await prisma.perfReport.create({
                data: { employeeId, templateId: template.id, frequency, periodStart: period.start, periodEnd: period.end },
            })
            reportId = r.id
        } catch (e) {
            // Two tabs opening the same period at once: hand back the winner.
            if (!isUniqueErr(e)) throw e
            const winner = await prisma.perfReport.findUnique({ where: key, select: { id: true } })
            if (!winner) throw e
            return NextResponse.json({ report: await reportDetail(winner.id, ctx), created: false })
        }
        await logActivity(reportId, "CREATED", ctx.userId)
        await refreshAutoValues(reportId)
        await recomputeReport(reportId)
        return NextResponse.json({ report: await reportDetail(reportId, ctx), created: true }, { status: 201 })
    } catch (e) {
        return perfErrorResponse(e, "[PERF_REPORTS_POST]")
    }
}
